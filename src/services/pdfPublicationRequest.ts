import type { SafeBlock, SafeDocument } from './safeDocument';
import type { SafeInline } from './safeInline';
import { isSafeAssetRef, type SafeAssetRef } from './safeAssetRef';
import { dirnameOf, resolveWithinRoot } from './pathSafety';
import { IMAGE_MIME_TYPES, extensionOf } from './imageMimeTypes';
import type { PublishTemplateOption } from './publishTemplateService';
import type { PageSizeOption } from './pageSizeService';
import type { BibliographyEntry } from './bibliographyService';

/**
 * A boundary-checked file reference for Rust's Typst pipeline - not bytes.
 * `path` is the SafeAssetRef's own document-relative path (already
 * normalized by resolveSafeAssetRef), the same key Rust looks assets up by
 * when it encounters the matching SafeImageBlock/SafeInlineImageInline
 * while walking the document. `resolvedPath` is an absolute path this
 * process already boundary-checked with resolveWithinRoot.
 *
 * `compile_typst_pdf` never trusts that claim on its own: `typst_compiler.rs`
 * re-derives and re-checks it against `PdfPublicationRequest.documentRoot`
 * (or the app's own cache directory for Mermaid-rendered SVGs) before ever
 * opening the file, the same never-trust-a-downstream-claim policy
 * `isSafeAssetRef` already applies one layer up. `generate_typst_source`
 * (typstExporter.ts) never opens the file at all - Typst *source* text only
 * ever contains `path` as a relative reference, never embedded bytes, so
 * there's nothing to re-validate there; this process is the one that
 * actually copies each asset into the exported project folder, re-checking
 * `path` against the destination with the same `resolveWithinRoot`.
 *
 * Either way, no file bytes travel over IPC at all: an image can be up to
 * 200MB, and serde's default `Vec<u8>` wire encoding is a JSON array of
 * numbers (3-5x the raw size) with no way to bound the cost before the
 * whole request is already built in memory.
 */
export interface TypstAsset {
  path: string;
  resolvedPath: string;
  mediaType: string;
}

const FNV_OFFSET_BASIS = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;
const MASK_64 = (1n << 64n) - 1n;

/**
 * FNV-1a 64-bit over UTF-8 bytes - deliberately dependency-free and small
 * enough to hand-port identically to Rust (see typst_writer.rs's
 * `fnv1a64`/`diagram_asset_path`). Both sides must derive the exact same
 * asset path for the same Mermaid diagram source with no other
 * coordination between them, so this implementation must never drift from
 * its Rust twin - a shared cross-language golden test (a fixed input with a
 * fixed expected hash) pins both.
 */
function fnv1a64(input: string): bigint {
  let hash = FNV_OFFSET_BASIS;
  for (const byte of new TextEncoder().encode(input)) {
    hash ^= BigInt(byte);
    hash = (hash * FNV_PRIME) & MASK_64;
  }
  return hash;
}

/**
 * The asset path a pre-rendered Mermaid diagram's SVG is bundled under -
 * content-addressed by the diagram source itself (not by traversal order),
 * so the frontend's SVG-generation pass and Rust's document walk don't need
 * to visit diagrams in the same order to agree on where each one lives.
 */
export function diagramAssetPath(code: string): string {
  return `mermaid/${fnv1a64(code).toString(16)}.svg`;
}

/**
 * A text-only title page's content (see typstPublishing.ts's
 * `createPdfCover`, shared by both PDF and Typst-source export) -
 * deliberately no background image or bleed this round, just centered
 * title/subtitle/author/publisher text (see the implementation plan's
 * explicit scope note).
 */
export interface PdfCover {
  title: string;
  subtitle: string;
  author: string;
  publisher: string;
  /** Document-relative, validated paths only. Empty means no image cover. */
  frontImagePath: string;
  /** Document-relative, validated paths only. Empty means no image cover. */
  backImagePath: string;
}

/**
 * The small, closed subset of AsciiDoc document attributes that changes
 * publication layout. Values are normalized in typstPublishing.ts before
 * crossing IPC; arbitrary AsciiDoc attributes never become Typst source.
 */
export interface PdfPublicationOptions {
  tocDepth: number;
  figureCaption: string;
  tableCaption: string;
  exampleCaption: string;
}

/**
 * Everything Rust's Typst pipeline needs, and nothing more - shared by both
 * `compile_typst_pdf` and `generate_typst_source` (`pdfA` is simply ignored
 * by the latter, which never compiles anything). `document` is the plain
 * `SafeDocument` JSON, unmodified. There is deliberately no
 * "typstConverter.ts" that turns it into Typst source: that conversion (and
 * its escaping) happens entirely in Rust, so the WebView never hands the
 * native compiler a string it could make executable. See the "신뢰 경계"
 * section of the implementation plan for the full rationale.
 */
export interface PdfPublicationRequest {
  document: SafeDocument;
  template: PublishTemplateOption;
  pageSize: PageSizeOption;
  cover: PdfCover;
  publication: PdfPublicationOptions;
  assets: TypstAsset[];
  /** Every citable source the document's `cite:[key]` markers may resolve
   * against - see BibliographyEntry. Shared verbatim with generate_typst_source,
   * same as every other field on this request. */
  bibliography: BibliographyEntry[];
  pdfA: boolean;
  /** The open document's own folder, or null for an unsaved document (in
   * which case `assets` must be empty - Preflight already blocks PDF/Typst
   * publish for an unsaved document via the `unsaved-manuscript` error).
   * `compile_typst_pdf` re-validates every asset's `resolvedPath` against
   * this boundary before reading it; `generate_typst_source` doesn't use
   * this field at all (see `TypstAsset`'s own doc comment for why). */
  documentRoot: string | null;
}

type BlockAssetCollector = (block: SafeBlock, out: SafeAssetRef[]) => void;
type InlineAssetCollector = (inline: SafeInline, out: SafeAssetRef[]) => void;

function collectFromInlines(inlines: SafeInline[], out: SafeAssetRef[]): void {
  for (const inline of inlines) INLINE_ASSET_COLLECTORS[inline.type](inline, out);
}

function collectFromBlocks(blocks: SafeBlock[], out: SafeAssetRef[]): void {
  for (const block of blocks) BLOCK_ASSET_COLLECTORS[block.type](block, out);
}

const noopInlineCollector: InlineAssetCollector = () => {};

// strong/emphasis/link/footnote/endnote/superscript/subscript/mark all carry a
// `children: SafeInline[]` field - a single shared collector recurses into
// whichever one the caller passes.
function collectInlineChildren(inline: SafeInline, out: SafeAssetRef[]): void {
  collectFromInlines((inline as { children: SafeInline[] }).children, out);
}

const INLINE_ASSET_COLLECTORS: Record<SafeInline['type'], InlineAssetCollector> = {
  text: noopInlineCollector,
  code: noopInlineCollector,
  math: noopInlineCollector,
  inlineImage: (inline, out) => out.push((inline as { asset: SafeAssetRef }).asset),
  strong: collectInlineChildren,
  emphasis: collectInlineChildren,
  link: collectInlineChildren,
  footnote: collectInlineChildren,
  endnote: collectInlineChildren,
  superscript: collectInlineChildren,
  subscript: collectInlineChildren,
  mark: collectInlineChildren,
  citation: noopInlineCollector,
};

const noopBlockCollector: BlockAssetCollector = () => {};

// section/container both carry a `blocks: SafeBlock[]` field.
function collectBlockChildren(block: SafeBlock, out: SafeAssetRef[]): void {
  collectFromBlocks((block as { blocks: SafeBlock[] }).blocks, out);
}

// paragraph/quote/admonition all carry an `inlines: SafeInline[]` field.
function collectBlockInlines(block: SafeBlock, out: SafeAssetRef[]): void {
  collectFromInlines((block as { inlines: SafeInline[] }).inlines, out);
}

function collectFromList(block: SafeBlock, out: SafeAssetRef[]): void {
  const items = (block as { items: { inlines: SafeInline[]; blocks: SafeBlock[] }[] }).items;
  for (const item of items) {
    collectFromInlines(item.inlines, out);
    collectFromBlocks(item.blocks, out);
  }
}

function collectFromDescriptionList(block: SafeBlock, out: SafeAssetRef[]): void {
  const items = (
    block as {
      items: { termInlines: SafeInline[]; descriptionInlines: SafeInline[]; descriptionBlocks: SafeBlock[] }[];
    }
  ).items;
  for (const item of items) {
    collectFromInlines(item.termInlines, out);
    collectFromInlines(item.descriptionInlines, out);
    collectFromBlocks(item.descriptionBlocks, out);
  }
}

function collectFromTable(block: SafeBlock, out: SafeAssetRef[]): void {
  const { rows } = block as { rows: { inlines: SafeInline[] }[][] };
  for (const row of rows) {
    for (const cell of row) collectFromInlines(cell.inlines, out);
  }
}

const BLOCK_ASSET_COLLECTORS: Record<SafeBlock['type'], BlockAssetCollector> = {
  section: collectBlockChildren,
  container: collectBlockChildren,
  formal: collectBlockChildren,
  columns: collectBlockChildren,
  documentPart: collectBlockChildren,
  paragraph: collectBlockInlines,
  quote: collectBlockInlines,
  admonition: collectBlockInlines,
  image: (block, out) => out.push((block as { asset: SafeAssetRef }).asset),
  list: collectFromList,
  descriptionList: collectFromDescriptionList,
  code: noopBlockCollector,
  diagram: noopBlockCollector,
  mathBlock: noopBlockCollector,
  table: collectFromTable,
  thematicBreak: noopBlockCollector,
  pageBreak: noopBlockCollector,
};

/**
 * Pure tree walk collecting every SafeAssetRef in a document - block images
 * AND inline images, recursing into every inline container (strong/
 * emphasis/link/footnote/endnote/superscript/subscript/mark) and every block
 * container (sections, open/example/sidebar/preamble containers, list
 * items, description list terms/descriptions, and rich table cells). No file I/O - see
 * loadPublicationAssets for the adapter that turns these into bytes.
 */
export function collectAssetReferences(document: SafeDocument): SafeAssetRef[] {
  const refs: SafeAssetRef[] = [];
  collectFromBlocks(document.blocks, refs);
  return refs;
}

type BlockDiagramCollector = (block: SafeBlock, out: string[]) => void;

function collectDiagramsFromBlocks(blocks: SafeBlock[], out: string[]): void {
  for (const block of blocks) BLOCK_DIAGRAM_COLLECTORS[block.type](block, out);
}

const noopDiagramCollector: BlockDiagramCollector = () => {};

function collectDiagramBlockChildren(block: SafeBlock, out: string[]): void {
  collectDiagramsFromBlocks((block as { blocks: SafeBlock[] }).blocks, out);
}

function collectDiagramsFromList(block: SafeBlock, out: string[]): void {
  const items = (block as { items: { blocks: SafeBlock[] }[] }).items;
  for (const item of items) collectDiagramsFromBlocks(item.blocks, out);
}

function collectDiagramsFromDescriptionList(block: SafeBlock, out: string[]): void {
  const items = (block as { items: { descriptionBlocks: SafeBlock[] }[] }).items;
  for (const item of items) collectDiagramsFromBlocks(item.descriptionBlocks, out);
}

const BLOCK_DIAGRAM_COLLECTORS: Record<SafeBlock['type'], BlockDiagramCollector> = {
  section: collectDiagramBlockChildren,
  container: collectDiagramBlockChildren,
  formal: collectDiagramBlockChildren,
  columns: collectDiagramBlockChildren,
  documentPart: collectDiagramBlockChildren,
  list: collectDiagramsFromList,
  descriptionList: collectDiagramsFromDescriptionList,
  diagram: (block, out) => out.push((block as { code: string }).code),
  paragraph: noopDiagramCollector,
  code: noopDiagramCollector,
  mathBlock: noopDiagramCollector,
  image: noopDiagramCollector,
  quote: noopDiagramCollector,
  admonition: noopDiagramCollector,
  table: noopDiagramCollector,
  thematicBreak: noopDiagramCollector,
  pageBreak: noopDiagramCollector,
};

/**
 * Pure tree walk collecting every Mermaid diagram's raw source code - block
 * images'/inline images' asset-collection pattern, but for the source
 * strings a caller must render to SVG (mermaidRenderer.ts's
 * renderMermaidToSvgString) before they can become a TypstAsset. There is
 * no inline diagram variant, so unlike collectAssetReferences this never
 * needs to look inside SafeInline[].
 */
export function collectDiagramCodes(document: SafeDocument): string[] {
  const codes: string[] = [];
  collectDiagramsFromBlocks(document.blocks, codes);
  return codes;
}

/** Refuses to keep collecting once a publication would carry too many
 * assets, rather than silently truncating - the caller sees a clear failure
 * instead of a PDF that's quietly missing images. Counting (not the total
 * byte size) is the only bound enforced here: assets are no longer read
 * into memory by this function at all, so there's nothing to sum. Rust
 * re-counts this same limit independently (never trusting this check was
 * actually applied) and separately enforces MAX_TOTAL_ASSET_BYTES once it
 * reads each file's real bytes from disk - see typst_compiler.rs. */
export const MAX_ASSET_COUNT = 500;

function mediaTypeFor(resolvedPath: string): string {
  return IMAGE_MIME_TYPES[extensionOf(resolvedPath)] ?? 'application/octet-stream';
}

/**
 * Resolves document-relative SafeAssetRefs to boundary-checked file
 * references shared by both PDF compilation and Typst-source export - no
 * file I/O happens here at all (see TypstAsset's own doc comment for how
 * each of the two downstream consumers uses `resolvedPath` differently).
 * Mirrors epubImages.ts's resolveWithinRoot-based boundary check and
 * dedup-by-resolved-path pattern.
 *
 * Remote refs are never resolved here - both exports are offline by design
 * (PreflightReport.pdfReady blocks the "Publish PDF"/"Export Typst source"
 * buttons whenever the document has remote images), so silently skipping
 * *those* is correct even if a future caller forgets to check pdfReady
 * first. Likewise a still-unsaved document (no `documentPath`) is already
 * blocked by Preflight's `unsaved-manuscript` error before export can be
 * attempted at all.
 */
export function loadPublicationAssets(refs: SafeAssetRef[], documentPath: string | null): TypstAsset[] {
  const baseDir = documentPath ? dirnameOf(documentPath) : null;
  const seenResolvedPaths = new Set<string>();
  const assets: TypstAsset[] = [];

  for (const ref of refs) {
    if (!isSafeAssetRef(ref) || ref.kind !== 'document-relative') continue;
    if (!baseDir) continue;

    // isSafeAssetRef already re-derives this same traversal check via
    // resolveSafeAssetRef, so this branch is currently unreachable for any
    // ref that passed the guard above - kept as defense-in-depth in case
    // that gate is ever weakened, rather than assumed redundant and removed.
    const resolvedPath = resolveWithinRoot(baseDir, ref.relativePath, baseDir);
    if (!resolvedPath) {
      throw new Error(`Refusing to publish: image "${ref.relativePath}" resolves outside the document folder.`);
    }
    if (seenResolvedPaths.has(resolvedPath)) continue;
    seenResolvedPaths.add(resolvedPath);

    if (assets.length >= MAX_ASSET_COUNT) {
      throw new Error(`Too many images/diagrams to publish as PDF (limit ${MAX_ASSET_COUNT}).`);
    }

    assets.push({ path: ref.relativePath, resolvedPath, mediaType: mediaTypeFor(resolvedPath) });
  }

  return assets;
}
