import type { SafeBlock, SafeDocument } from './safeDocument';
import type { SafeInline } from './safeInline';

export interface BrokenCrossReference {
  target: string;
  /** The enclosing block's line - inlines carry no location of their own,
   * the same "nearest block" policy typst_writer.rs uses for depth errors. */
  line: number | null;
}

interface WalkState {
  anchors: Set<string>;
  references: BrokenCrossReference[];
}

/** Mirrors typst_writer.rs's `is_valid_label_name`. Only ids passing this
 * become Typst labels, and only fragments passing it become `#link(label())`
 * - so both sides must agree on the charset, or Preflight would flag
 * references Typst actually resolves, or miss ones it doesn't. */
function isValidLabelName(id: string): boolean {
  return /^[A-Za-z0-9_-]+$/.test(id);
}

function anchorIdOf(block: SafeBlock): string | null {
  const id = 'id' in block ? (block.id ?? null) : null;
  return id && isValidLabelName(id) ? id : null;
}

function inlineChildrenOf(inline: SafeInline): SafeInline[] {
  return 'children' in inline ? inline.children : [];
}

function collectFromInlines(inlines: SafeInline[], line: number | null, state: WalkState): void {
  for (const inline of inlines) {
    if (inline.type === 'link' && !inline.isWikilink && inline.target.startsWith('#')) {
      const fragment = inline.target.slice(1);
      if (isValidLabelName(fragment)) state.references.push({ target: fragment, line });
    }
    collectFromInlines(inlineChildrenOf(inline), line, state);
  }
}

type BlockWalker = (block: SafeBlock, state: WalkState) => void;

const noop: BlockWalker = () => {};

const walkInlines: BlockWalker = (block, state) => {
  const { inlines, location } = block as { inlines: SafeInline[]; location: { line: number | null } };
  collectFromInlines(inlines, location.line, state);
};

const walkChildren: BlockWalker = (block, state) => {
  walkBlocks((block as { blocks: SafeBlock[] }).blocks, state);
};

const walkCallouts: BlockWalker = (block, state) => {
  const { callouts, location } = block as {
    callouts?: { inlines: SafeInline[] }[];
    location: { line: number | null };
  };
  for (const callout of callouts ?? []) collectFromInlines(callout.inlines, location.line, state);
};

const walkList: BlockWalker = (block, state) => {
  const items = (
    block as { items: { inlines: SafeInline[]; blocks: SafeBlock[]; location: { line: number | null } }[] }
  ).items;
  for (const item of items) {
    collectFromInlines(item.inlines, item.location.line, state);
    walkBlocks(item.blocks, state);
  }
};

const walkDescriptionList: BlockWalker = (block, state) => {
  const items = (
    block as {
      items: {
        termInlines: SafeInline[];
        descriptionInlines: SafeInline[];
        descriptionBlocks: SafeBlock[];
        location: { line: number | null };
      }[];
    }
  ).items;
  for (const item of items) {
    collectFromInlines(item.termInlines, item.location.line, state);
    collectFromInlines(item.descriptionInlines, item.location.line, state);
    walkBlocks(item.descriptionBlocks, state);
  }
};

const walkTable: BlockWalker = (block, state) => {
  const { rows, location } = block as { rows: { inlines: SafeInline[] }[][]; location: { line: number | null } };
  for (const row of rows) {
    for (const cell of row) collectFromInlines(cell.inlines, location.line, state);
  }
};

const BLOCK_WALKERS: Record<SafeBlock['type'], BlockWalker> = {
  section: walkChildren,
  container: walkChildren,
  formal: walkChildren,
  columns: walkChildren,
  documentPart: walkChildren,
  paragraph: walkInlines,
  quote: walkInlines,
  admonition: walkInlines,
  list: walkList,
  descriptionList: walkDescriptionList,
  code: walkCallouts,
  diagram: noop,
  mathBlock: noop,
  image: noop,
  table: walkTable,
  thematicBreak: noop,
  pageBreak: noop,
};

function walkBlocks(blocks: SafeBlock[], state: WalkState): void {
  for (const block of blocks) {
    const id = anchorIdOf(block);
    if (id) state.anchors.add(id);
    BLOCK_WALKERS[block.type](block, state);
  }
}

/**
 * Cross-references (`<<id>>`) pointing at an id no block in the document
 * actually carries. Typst preview deliberately degrades an unresolved label
 * to plain text so an included chapter can render on its own. Publishing,
 * however, must not ship that degraded result: Preflight reports it as a
 * blocking error with a source line, per DESIGN_GUIDELINES.md §7 ("오류는
 * 출판을 막고 ... 오류를 묵살하는 자동 수정은 하지 않는다").
 *
 * The usual cause is AsciiDoc's `[[id]]` block-anchor syntax, which this app
 * deliberately reserves for wikilinks (see wikilinkService.ts), so the
 * anchor never reaches Asciidoctor at all - `[#id]` is the form that does.
 */
export function findBrokenCrossReferences(document: SafeDocument | undefined): BrokenCrossReference[] {
  if (!document) return [];
  const state: WalkState = { anchors: new Set(), references: [] };
  walkBlocks(document.blocks, state);

  const reported = new Set<string>();
  return state.references.filter((reference) => {
    if (state.anchors.has(reference.target) || reported.has(reference.target)) return false;
    reported.add(reference.target);
    return true;
  });
}
