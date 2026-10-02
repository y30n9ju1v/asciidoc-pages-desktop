import { isSafeInlineLinkTarget, type SafeInline } from './safeInline';
import { isSafeAssetRef, type SafeAssetRef } from './safeAssetRef';
import { formatBibliographyEntry, type BibliographyEntry } from './bibliographyService';
import { escapeHtml } from './htmlEscape';
import type {
  SafeAdmonition,
  SafeBlock,
  SafeCodeBlock,
  SafeContainer,
  SafeColumnsBlock,
  SafeDescriptionList,
  SafeDocumentPart,
  SafeDiagramBlock,
  SafeDocument,
  SafeImageBlock,
  SafeList,
  SafeMathBlock,
  SafeFormalBlock,
  SafePageBreak,
  SafeParagraph,
  SafeQuote,
  SafeSection,
  SafeTable,
  SafeThematicBreak,
} from './safeDocument';

interface RendererState {
  footnotes: SafeInline[][];
  endnotes: SafeInline[][];
  sectionIds: Map<SafeSection, string>;
  /** key -> 1-based number, in first-encounter order - unlike footnotes
   * (position-based, never deduped), a repeated `cite:[key]` must reuse the
   * same number, so this is keyed by citation key rather than accumulated
   * as a plain array. */
  citations: Map<string, number>;
}

type BlockRenderer = (block: SafeBlock, state: RendererState) => string;

/**
 * Re-validates via isSafeAssetRef rather than trusting `asset`'s TypeScript
 * type - types don't exist at runtime, so a manually constructed
 * SafeDocument (or one relayed through a worker message, or a future
 * on-disk cache) could still carry an asset that only claims to be safe.
 * Returns the `src` to use, or null to render no image at all.
 */
function assetSrc(asset: SafeAssetRef): string | null {
  if (!isSafeAssetRef(asset)) return null;
  return asset.kind === 'remote' ? asset.url : asset.relativePath;
}

function renderLink(inline: Extract<SafeInline, { type: 'link' }>, state: RendererState): string {
  const label = renderInlines(inline.children, state);
  if (!isSafeInlineLinkTarget(inline.target)) return label;
  const className = inline.isWikilink ? ` class="wikilink${inline.isUnresolvedWikilink ? ' wikilink-new' : ''}"` : '';
  return `<a href="${escapeHtml(inline.target)}"${className}>${label}</a>`;
}

function renderFootnote(inline: Extract<SafeInline, { type: 'footnote' }>, state: RendererState): string {
  const number = state.footnotes.push(inline.children);
  const referenceId = `_footnoteref_${number}`;
  return `<sup class="footnote" id="${referenceId}"><a href="#_footnotedef_${number}" title="View footnote">${number}</a></sup>`;
}

function renderEndnote(inline: Extract<SafeInline, { type: 'endnote' }>, state: RendererState): string {
  const number = state.endnotes.push(inline.children);
  const referenceId = `_endnoteref_${number}`;
  return `<sup class="endnote" id="${referenceId}"><a href="#_endnotedef_${number}" title="View endnote">[${number}]</a></sup>`;
}

function renderCitation(inline: Extract<SafeInline, { type: 'citation' }>, state: RendererState): string {
  const existing = state.citations.get(inline.key);
  const number = existing ?? state.citations.size + 1;
  if (existing === undefined) state.citations.set(inline.key, number);
  return `<sup class="citation" id="_citationref_${number}"><a href="#_citationdef_${number}">[${number}]</a></sup>`;
}

function renderInlineImage(inline: Extract<SafeInline, { type: 'inlineImage' }>): string {
  const src = assetSrc(inline.asset);
  if (!src) return '';
  return `<span class="image"><img src="${escapeHtml(src)}" alt="${escapeHtml(inline.alt)}"></span>`;
}

type InlineRenderer = (inline: SafeInline, state: RendererState) => string;

// A lookup table (matching BLOCK_RENDERERS below) rather than a switch: a
// switch over this many SafeInline variants trips the project's cyclomatic
// complexity limit (DESIGN_GUIDELINES.md, enforced by ESLint) well before it
// gets hard to read, and a table keeps each case a one-line, independently
// readable entry instead of one long function.
const INLINE_RENDERERS: Record<SafeInline['type'], InlineRenderer> = {
  text: (inline) => escapeHtml((inline as Extract<SafeInline, { type: 'text' }>).value),
  strong: (inline, state) =>
    `<strong>${renderInlines((inline as Extract<SafeInline, { type: 'strong' }>).children, state)}</strong>`,
  emphasis: (inline, state) =>
    `<em>${renderInlines((inline as Extract<SafeInline, { type: 'emphasis' }>).children, state)}</em>`,
  code: (inline) => `<code>${escapeHtml((inline as Extract<SafeInline, { type: 'code' }>).value)}</code>`,
  math: (inline) => `\\(${escapeHtml((inline as Extract<SafeInline, { type: 'math' }>).tex)}\\)`,
  link: (inline, state) => renderLink(inline as Extract<SafeInline, { type: 'link' }>, state),
  footnote: (inline, state) => renderFootnote(inline as Extract<SafeInline, { type: 'footnote' }>, state),
  endnote: (inline, state) => renderEndnote(inline as Extract<SafeInline, { type: 'endnote' }>, state),
  inlineImage: (inline) => renderInlineImage(inline as Extract<SafeInline, { type: 'inlineImage' }>),
  superscript: (inline, state) =>
    `<sup>${renderInlines((inline as Extract<SafeInline, { type: 'superscript' }>).children, state)}</sup>`,
  subscript: (inline, state) =>
    `<sub>${renderInlines((inline as Extract<SafeInline, { type: 'subscript' }>).children, state)}</sub>`,
  mark: (inline, state) =>
    `<mark>${renderInlines((inline as Extract<SafeInline, { type: 'mark' }>).children, state)}</mark>`,
  citation: (inline, state) => renderCitation(inline as Extract<SafeInline, { type: 'citation' }>, state),
};

function renderInline(inline: SafeInline, state: RendererState): string {
  return INLINE_RENDERERS[inline.type](inline, state);
}

function renderInlines(inlines: SafeInline[], state: RendererState): string {
  return inlines.map((inline) => renderInline(inline, state)).join('');
}

function sectionChildren(section: SafeSection): SafeSection[] {
  return section.blocks.filter((block): block is SafeSection => block.type === 'section');
}

function sectionSlug(section: SafeSection): string {
  const source = section.id ?? section.title;
  const slug = source
    .toLowerCase()
    .replace(/[^a-z0-9\u00c0-\uffff]+/g, '-')
    .replace(/(^-|-$)/g, '');
  return slug || 'section';
}

function assignSectionIds(blocks: SafeBlock[], state: RendererState, seen = new Map<string, number>()): void {
  for (const block of blocks) {
    if (block.type !== 'section') continue;
    const base = sectionSlug(block);
    const occurrence = seen.get(base) ?? 0;
    seen.set(base, occurrence + 1);
    state.sectionIds.set(block, occurrence === 0 ? base : `${base}-${occurrence + 1}`);
    assignSectionIds(block.blocks, state, seen);
  }
}

function renderTocItems(sections: SafeSection[], state: RendererState): string {
  if (sections.length === 0) return '';
  const items = sections
    .map((section) => {
      const id = state.sectionIds.get(section)!;
      return `<li><a href="#${escapeHtml(id)}">${escapeHtml(section.title)}</a>${renderTocItems(sectionChildren(section), state)}</li>`;
    })
    .join('');
  return `<ul>${items}</ul>`;
}

function renderToc(document: SafeDocument, state: RendererState): string {
  const sections = document.blocks.filter((block): block is SafeSection => block.type === 'section');
  if (sections.length === 0) return '';
  return `<div id="toc" class="toc"><div id="toctitle">Table of Contents</div>${renderTocItems(sections, state)}</div>`;
}

function renderHeader(document: SafeDocument): string {
  const author = document.metadata.author ? `<span id="author">${escapeHtml(document.metadata.author)}</span>` : '';
  const details = author ? `<div class="details">${author}</div>` : '';
  return `<div id="header"><h1>${escapeHtml(document.metadata.title)}</h1>${details}</div>`;
}

function renderSection(block: SafeSection, state: RendererState): string {
  const id = state.sectionIds.get(block)!;
  const headingLevel = Math.min(block.level + 1, 6);
  return `<div class="sect${block.level}"><h${headingLevel} id="${escapeHtml(id)}">${escapeHtml(block.title)}</h${headingLevel}><div class="sectionbody">${renderBlocks(block.blocks, state)}</div></div>`;
}

function renderParagraph(block: SafeParagraph, state: RendererState): string {
  return `<div class="paragraph"><p>${renderInlines(block.inlines, state)}</p></div>`;
}

function renderCodeCallouts(block: SafeCodeBlock, state: RendererState): string {
  const callouts = block.callouts ?? [];
  if (callouts.length === 0) return '';
  const items = callouts
    .map(
      (callout) => `<li><span class="conum">(${callout.number})</span> ${renderInlines(callout.inlines, state)}</li>`,
    )
    .join('');
  return `<div class="colist"><ol>${items}</ol></div>`;
}

function publicationCode(code: string, block: SafeCodeBlock): string {
  return (block.callouts ?? []).reduce(
    (result, callout) => result.split(`<${callout.number}>`).join(`(${callout.number})`),
    code,
  );
}

function renderCode(block: SafeCodeBlock, state: RendererState): string {
  const language = block.language ? ` language-${escapeHtml(block.language)}` : '';
  const id = block.id ? ` id="${escapeHtml(block.id)}"` : '';
  const caption = block.caption ? `<div class="title">${escapeHtml(block.caption)}</div>` : '';
  return `<div class="listingblock"${id}>${caption}<div class="content"><pre class="highlight"><code class="${language.trim()}">${escapeHtml(publicationCode(block.code, block))}</code></pre></div>${renderCodeCallouts(block, state)}</div>`;
}

function renderDiagram(block: SafeDiagramBlock): string {
  const id = block.id ? ` id="${escapeHtml(block.id)}"` : '';
  const caption = block.caption ? `<div class="title">${escapeHtml(block.caption)}</div>` : '';
  return `<div class="listingblock"${id}>${caption}<div class="content"><pre class="highlight"><code class="language-mermaid">${escapeHtml(block.code)}</code></pre></div></div>`;
}

function renderMathBlock(block: SafeMathBlock): string {
  const id = block.id ? ` id="${escapeHtml(block.id)}"` : '';
  const caption = block.caption ? `<div class="title">${escapeHtml(block.caption)}</div>` : '';
  return `<div class="stemblock"${id}><div class="content">\\[${escapeHtml(block.tex)}\\]</div>${caption}</div>`;
}

function renderImage(block: SafeImageBlock): string {
  const src = assetSrc(block.asset);
  if (!src) return '';
  const id = block.id ? ` id="${escapeHtml(block.id)}"` : '';
  const img = `<img src="${escapeHtml(src)}" alt="${escapeHtml(block.alt)}">`;
  if (block.caption) {
    return `<figure class="imageblock"${id}><div class="content">${img}</div><figcaption>${escapeHtml(block.caption)}</figcaption></figure>`;
  }
  return `<div class="imageblock"${id}><div class="content">${img}</div></div>`;
}

function checklistMarker(checked: boolean | null): string {
  if (checked === null) return '';
  return `<input type="checkbox" disabled${checked ? ' checked' : ''}> `;
}

function renderList(block: SafeList, state: RendererState): string {
  const tag = block.ordered ? 'ol' : 'ul';
  const className = block.ordered ? 'olist' : 'ulist';
  const items = block.items
    .map(
      (item) =>
        `<li><p>${checklistMarker(item.checked)}${renderInlines(item.inlines, state)}</p>${renderBlocks(item.blocks, state)}</li>`,
    )
    .join('');
  return `<div class="${className}"><${tag}>${items}</${tag}></div>`;
}

function renderDescriptionList(block: SafeDescriptionList, state: RendererState): string {
  const items = block.items
    .map(
      (item) =>
        `<dt>${renderInlines(item.termInlines, state)}</dt><dd><p>${renderInlines(item.descriptionInlines, state)}</p>${renderBlocks(item.descriptionBlocks, state)}</dd>`,
    )
    .join('');
  return `<div class="dlist"><dl>${items}</dl></div>`;
}

function renderQuote(block: SafeQuote, state: RendererState): string {
  const sourceParts = [
    block.attribution ? `<cite>${escapeHtml(block.attribution)}</cite>` : '',
    block.citation ? escapeHtml(block.citation) : '',
  ].filter(Boolean);
  const footer = sourceParts.length > 0 ? `<div class="attribution">&#8212; ${sourceParts.join(', ')}</div>` : '';
  return `<div class="quoteblock"><blockquote><div class="paragraph"><p>${renderInlines(block.inlines, state)}</p></div></blockquote>${footer}</div>`;
}

function renderAdmonition(block: SafeAdmonition, state: RendererState): string {
  return `<div class="admonitionblock ${block.kind}"><table><tbody><tr><td class="icon"></td><td class="content"><div class="title">${escapeHtml(block.kind)}</div>${renderInlines(block.inlines, state)}</td></tr></tbody></table></div>`;
}

function renderTableCell(cell: SafeTable['rows'][number][number], state: RendererState, tag: 'td' | 'th'): string {
  return `<${tag}>${renderInlines(cell.inlines, state)}</${tag}>`;
}

function renderTableRow(row: SafeTable['rows'][number], state: RendererState, tag: 'td' | 'th'): string {
  return `<tr>${row.map((cell) => renderTableCell(cell, state, tag)).join('')}</tr>`;
}

function renderTable(block: SafeTable, state: RendererState): string {
  const [headerRow, ...bodyRows] = block.rows;
  const hasHeader = block.hasHeader && headerRow;
  const head = hasHeader ? `<thead>${renderTableRow(headerRow, state, 'th')}</thead>` : '';
  const body = (hasHeader ? bodyRows : block.rows).map((row) => renderTableRow(row, state, 'td')).join('');
  const id = block.id ? ` id="${escapeHtml(block.id)}"` : '';
  const caption = block.caption ? `<div class="title">${escapeHtml(block.caption)}</div>` : '';
  return `<div class="tableblock"${id}>${caption}<table class="tableblock frame-all grid-all stretch">${head}<tbody>${body}</tbody></table></div>`;
}

function renderContainer(block: SafeContainer, state: RendererState): string {
  const title = block.title ? `<div class="title">${escapeHtml(block.title)}</div>` : '';
  const body = renderBlocks(block.blocks, state);
  if (block.kind === 'preamble') return `<div id="preamble"><div class="sectionbody">${body}</div></div>`;
  return `<div class="${block.kind}block">${title}<div class="content">${body}</div></div>`;
}

function renderFormal(block: SafeFormalBlock, state: RendererState): string {
  const title = block.title ? `: ${escapeHtml(block.title)}` : '';
  const id = block.id ? ` id="${escapeHtml(block.id)}"` : '';
  return `<section class="formalblock ${block.kind}"${id}><div class="title">${escapeHtml(block.kind)}${title}</div><div class="content">${renderBlocks(block.blocks, state)}</div></section>`;
}

function renderColumns(block: SafeColumnsBlock, state: RendererState): string {
  return `<div class="publication-columns columns-${block.count}">${renderBlocks(block.blocks, state)}</div>`;
}

function renderDocumentPart(block: SafeDocumentPart, state: RendererState): string {
  const title = block.title ? `<div class="title">${escapeHtml(block.title)}</div>` : '';
  return `<section class="document-part ${block.kind}">${title}${renderBlocks(block.blocks, state)}</section>`;
}

function renderThematicBreak(_block: SafeThematicBreak): string {
  return '<hr>';
}

function renderPageBreak(_block: SafePageBreak): string {
  return '<div class="pagebreak"></div>';
}

const BLOCK_RENDERERS: Record<SafeBlock['type'], BlockRenderer> = {
  section: (block, state) => renderSection(block as SafeSection, state),
  container: (block, state) => renderContainer(block as SafeContainer, state),
  formal: (block, state) => renderFormal(block as SafeFormalBlock, state),
  columns: (block, state) => renderColumns(block as SafeColumnsBlock, state),
  documentPart: (block, state) => renderDocumentPart(block as SafeDocumentPart, state),
  paragraph: (block, state) => renderParagraph(block as SafeParagraph, state),
  code: (block, state) => renderCode(block as SafeCodeBlock, state),
  diagram: (block) => renderDiagram(block as SafeDiagramBlock),
  mathBlock: (block) => renderMathBlock(block as SafeMathBlock),
  image: (block) => renderImage(block as SafeImageBlock),
  list: (block, state) => renderList(block as SafeList, state),
  descriptionList: (block, state) => renderDescriptionList(block as SafeDescriptionList, state),
  quote: (block, state) => renderQuote(block as SafeQuote, state),
  admonition: (block, state) => renderAdmonition(block as SafeAdmonition, state),
  table: (block, state) => renderTable(block as SafeTable, state),
  thematicBreak: (block) => renderThematicBreak(block as SafeThematicBreak),
  pageBreak: (block) => renderPageBreak(block as SafePageBreak),
};

function renderBlocks(blocks: SafeBlock[], state: RendererState): string {
  return blocks.map((block) => BLOCK_RENDERERS[block.type](block, state)).join('');
}

function renderFootnotes(state: RendererState): string {
  if (state.footnotes.length === 0) return '';
  const definitions = state.footnotes
    .map(
      (inlines, index) =>
        `<div class="footnote" id="_footnotedef_${index + 1}"><a href="#_footnoteref_${index + 1}">${index + 1}.</a> ${renderInlines(inlines, state)}</div>`,
    )
    .join('');
  return `<div id="footnotes"><hr>${definitions}</div>`;
}

function renderEndnotes(state: RendererState): string {
  if (state.endnotes.length === 0) return '';

  // Rendering a note can itself encounter another endnote. Indexing over the
  // growing collection keeps that nested note reachable without recursion.
  const definitions: string[] = [];
  for (let index = 0; index < state.endnotes.length; index += 1) {
    const number = index + 1;
    const contents = renderInlines(state.endnotes[index], state);
    definitions.push(
      `<div class="endnote" id="_endnotedef_${number}"><a href="#_endnoteref_${number}">[${number}]</a> ${contents}</div>`,
    );
  }
  return `<div id="endnotes"><hr><div id="endnotestitle">Notes</div>${definitions.join('')}</div>`;
}

/**
 * A numbered References section appended after the body - only when the
 * document actually cites something, mirroring typst_writer.rs's own
 * write_references exactly (same numbering, same "Unresolved citation: key"
 * fallback for a cited key with no matching entry) so PDF and HTML/EPUB show
 * the same thing for the same document.
 */
function renderReferences(state: RendererState, bibliography: BibliographyEntry[]): string {
  if (state.citations.size === 0) return '';
  const byKey = new Map(bibliography.map((entry) => [entry.key, entry]));
  const ordered = Array.from(state.citations.entries()).sort((a, b) => a[1] - b[1]);
  const items = ordered
    .map(([key, number]) => {
      const entry = byKey.get(key);
      const line = entry ? formatBibliographyEntry(entry) : `Unresolved citation: ${key}`;
      // entry.url is user-entered wire data, same as any SafeLinkInline
      // target - degrades to a plain (unlinked) line rather than ever
      // interpolating an unsafe scheme into href, the same "degrade,
      // don't inject" policy renderLink already applies.
      const body =
        entry?.url && isSafeInlineLinkTarget(entry.url)
          ? `<a href="${escapeHtml(entry.url)}">${escapeHtml(line)}</a>`
          : escapeHtml(line);
      return `<div class="reference" id="_citationdef_${number}"><a href="#_citationref_${number}">[${number}]</a> ${body}</div>`;
    })
    .join('');
  return `<div id="references"><hr><div id="referencestitle">References</div>${items}</div>`;
}

/**
 * Renders only SafeDocument's closed set of nodes. All data is escaped at the
 * output boundary, and links/assets are checked again to make this safe even
 * when a caller constructs a SafeDocument without the normalizer.
 *
 * `bibliography` defaults to empty - the Vault-level live preview has no
 * Book Project bibliography to thread through in most call paths, and a
 * cited-but-unresolved key already degrades to a visible "Unresolved
 * citation" line (see renderReferences) rather than silently vanishing, so
 * an empty default is a safe, honest fallback rather than a footgun.
 */
export function renderSafeDocumentToHtml(document: SafeDocument, bibliography: BibliographyEntry[] = []): string {
  const state: RendererState = { footnotes: [], endnotes: [], sectionIds: new Map(), citations: new Map() };
  assignSectionIds(document.blocks, state);
  return `${renderHeader(document)}${renderToc(document, state)}${renderBlocks(document.blocks, state)}${renderFootnotes(state)}${renderEndnotes(state)}${renderReferences(state, bibliography)}`;
}

/**
 * Renders an arbitrary subset of blocks (no document header/TOC) with its
 * own independent footnote numbering and section-id assignment - the EPUB
 * exporter uses this once per chapter. Rendering each chapter as its own
 * unit naturally gives each chapter its own locally-numbered footnote list,
 * rather than needing a separate DOM pass to regroup a single document-wide
 * footnotes block back into per-chapter files after the fact. Citation
 * numbering is likewise chapter-scoped - the same tradeoff the EPUB exporter
 * already made for footnotes, extended here for consistency rather than
 * introducing a different (whole-book) numbering scheme for the one other
 * numbered-reference construct in the document.
 */
export function renderSafeBlocksToHtml(blocks: SafeBlock[], bibliography: BibliographyEntry[] = []): string {
  const state: RendererState = { footnotes: [], endnotes: [], sectionIds: new Map(), citations: new Map() };
  assignSectionIds(blocks, state);
  return `${renderBlocks(blocks, state)}${renderFootnotes(state)}${renderEndnotes(state)}${renderReferences(state, bibliography)}`;
}
