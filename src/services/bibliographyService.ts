import type { SafeBlock } from './safeDocument';
import type { SafeInline } from './safeInline';

/**
 * One citable source. Lives in its own module (not bookProjectService.ts,
 * despite being persisted as part of a BookProject) because both
 * safeHtmlRenderer.ts and bookProjectService.ts need this type, and
 * safeHtmlRenderer.ts must not depend on Book Project's persistence-layer
 * concerns - it also renders the Vault-level live preview, which has no
 * Book Project open at all. `key` matches a `cite:[key]` marker's own key by
 * exact string equality (see safeInline.ts's `citeInline`); charset is
 * restricted to `[A-Za-z0-9_-]+` by the regex that captures it, so this type
 * itself carries no separate validity concept.
 */
export interface BibliographyEntry {
  key: string;
  author: string;
  title: string;
  year: string;
  publisher: string;
  url: string;
}

export function createBibliographyEntry(key: string): BibliographyEntry {
  return { key, author: '', title: '', year: '', publisher: '', url: '' };
}

function hasKey(entries: BibliographyEntry[], key: string): boolean {
  return entries.some((entry) => entry.key === key);
}

/** Same add/remove/move shape as bookProjectWorkspaceService.ts's chapter
 * helpers - pure functions over the list, no I/O. */
export function addBibliographyEntry(entries: BibliographyEntry[], key: string): BibliographyEntry[] {
  return hasKey(entries, key) ? entries : [...entries, createBibliographyEntry(key)];
}

export function removeBibliographyEntry(entries: BibliographyEntry[], key: string): BibliographyEntry[] {
  return entries.filter((entry) => entry.key !== key);
}

export function updateBibliographyEntry(entries: BibliographyEntry[], updated: BibliographyEntry): BibliographyEntry[] {
  return entries.map((entry) => (entry.key === updated.key ? updated : entry));
}

export function moveBibliographyEntry(entries: BibliographyEntry[], key: string, offset: -1 | 1): BibliographyEntry[] {
  const index = entries.findIndex((entry) => entry.key === key);
  const targetIndex = index + offset;
  if (index === -1 || targetIndex < 0 || targetIndex >= entries.length) return entries;

  const next = [...entries];
  [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
  return next;
}

/** Mirrors typst_writer.rs's own format_bibliography_entry exactly, so a
 * resolved citation reads identically in HTML/EPUB and PDF. */
export function formatBibliographyEntry(entry: BibliographyEntry): string {
  const year = entry.year ? ` (${entry.year})` : '';
  const publisher = entry.publisher ? `, ${entry.publisher}` : '';
  return `${entry.author}${year}. ${entry.title}${publisher}.`;
}

// Lookup tables rather than if/else chains - the same reason
// pdfPublicationRequest.ts's own asset/diagram collectors and
// safeHtmlRenderer.ts's renderer tables do this (see safeHtmlRenderer.ts's
// own comment): a chain covering this many SafeInline/SafeBlock variants
// trips the project's ESLint cyclomatic-complexity limit well before it
// gets hard to read.
type InlineCitationCollector = (inline: SafeInline, keys: string[]) => void;

const noopInlineCollector: InlineCitationCollector = () => {};

function collectFromChildren(inline: SafeInline, keys: string[]): void {
  collectCitationKeysFromInlines((inline as { children: SafeInline[] }).children, keys);
}

const INLINE_CITATION_COLLECTORS: Record<SafeInline['type'], InlineCitationCollector> = {
  text: noopInlineCollector,
  code: noopInlineCollector,
  math: noopInlineCollector,
  inlineImage: noopInlineCollector,
  strong: collectFromChildren,
  emphasis: collectFromChildren,
  link: collectFromChildren,
  footnote: collectFromChildren,
  endnote: collectFromChildren,
  superscript: collectFromChildren,
  subscript: collectFromChildren,
  mark: collectFromChildren,
  citation: (inline, keys) => {
    const key = (inline as Extract<SafeInline, { type: 'citation' }>).key;
    if (!keys.includes(key)) keys.push(key);
  },
};

function collectCitationKeysFromInlines(inlines: SafeInline[], keys: string[]): void {
  for (const inline of inlines) INLINE_CITATION_COLLECTORS[inline.type](inline, keys);
}

type BlockCitationCollector = (block: SafeBlock, keys: string[]) => void;

const noopBlockCollector: BlockCitationCollector = () => {};

function collectBlockChildren(block: SafeBlock, keys: string[]): void {
  collectCitationKeysFromBlocks((block as { blocks: SafeBlock[] }).blocks, keys);
}

function collectBlockInlines(block: SafeBlock, keys: string[]): void {
  collectCitationKeysFromInlines((block as { inlines: SafeInline[] }).inlines, keys);
}

function collectFromListBlock(block: SafeBlock, keys: string[]): void {
  const items = (block as { items: { inlines: SafeInline[]; blocks: SafeBlock[] }[] }).items;
  for (const item of items) {
    collectCitationKeysFromInlines(item.inlines, keys);
    collectCitationKeysFromBlocks(item.blocks, keys);
  }
}

function collectFromDescriptionListBlock(block: SafeBlock, keys: string[]): void {
  const items = (
    block as {
      items: { termInlines: SafeInline[]; descriptionInlines: SafeInline[]; descriptionBlocks: SafeBlock[] }[];
    }
  ).items;
  for (const item of items) {
    collectCitationKeysFromInlines(item.termInlines, keys);
    collectCitationKeysFromInlines(item.descriptionInlines, keys);
    collectCitationKeysFromBlocks(item.descriptionBlocks, keys);
  }
}

function collectFromTableBlock(block: SafeBlock, keys: string[]): void {
  const { rows } = block as { rows: { inlines: SafeInline[] }[][] };
  for (const row of rows) {
    for (const cell of row) collectCitationKeysFromInlines(cell.inlines, keys);
  }
}

const BLOCK_CITATION_COLLECTORS: Record<SafeBlock['type'], BlockCitationCollector> = {
  section: collectBlockChildren,
  container: collectBlockChildren,
  formal: collectBlockChildren,
  columns: collectBlockChildren,
  documentPart: collectBlockChildren,
  paragraph: collectBlockInlines,
  quote: collectBlockInlines,
  admonition: collectBlockInlines,
  list: collectFromListBlock,
  descriptionList: collectFromDescriptionListBlock,
  code: noopBlockCollector,
  diagram: noopBlockCollector,
  mathBlock: noopBlockCollector,
  image: noopBlockCollector,
  table: collectFromTableBlock,
  thematicBreak: noopBlockCollector,
  pageBreak: noopBlockCollector,
};

function collectCitationKeysFromBlocks(blocks: SafeBlock[], keys: string[]): void {
  for (const block of blocks) BLOCK_CITATION_COLLECTORS[block.type](block, keys);
}

/** Every distinct citation key the document actually uses, in first-
 * appearance order - mirrors typst_writer.rs's collect_citation_keys
 * exactly (same traversal, same dedup-by-first-occurrence), used here by
 * preflightService.ts to flag a cited key absent from the bibliography. */
export function collectCitationKeys(blocks: SafeBlock[]): string[] {
  const keys: string[] = [];
  collectCitationKeysFromBlocks(blocks, keys);
  return keys;
}

/** Cited keys with no matching bibliography entry - Preflight surfaces each
 * as a warning rather than silently letting the publish ship an "Unresolved
 * citation: key" line the author never noticed. */
export function findUnresolvedCitationKeys(blocks: SafeBlock[], bibliography: BibliographyEntry[]): string[] {
  const known = new Set(bibliography.map((entry) => entry.key));
  return collectCitationKeys(blocks).filter((key) => !known.has(key));
}
