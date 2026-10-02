import { appCacheDir } from '@tauri-apps/api/path';
import { mkdir, writeFile } from '@tauri-apps/plugin-fs';
import type { AsciidocDocMeta } from './asciidocService';
import type { SafeDocument, SafeDocumentMetadata } from './safeDocument';
import { resolveSafeAssetRef, type SafeAssetRef } from './safeAssetRef';
import type { BookMetadata } from './bookProjectService';
import type { BibliographyEntry } from './bibliographyService';
import type { ThemeInput } from './themeService';
import { renderMermaidToSvgString } from './mermaidRenderer';
import { dirnameOf } from './pathSafety';
import {
  collectDiagramCodes,
  diagramAssetPath,
  type PdfCover,
  type PdfPublicationOptions,
  type TypstAsset,
} from './pdfPublicationRequest';

/**
 * Shared between `pdfExporter.ts` and `typstExporter.ts` - both send the
 * same request shape (`document`/`template`/`pageSize`/`cover`/`assets`) to
 * a Rust command that runs `typst_writer.rs`'s `write_document` (either to
 * compile a PDF or to hand back the Typst source text directly), so the
 * metadata-merging, cover assembly, and diagram-rendering steps that build
 * that shared shape live here once instead of twice.
 */

/** The `compile_typst_pdf`/`generate_typst_source` commands' structured
 * error shape (see PublishError in publication_request.rs) - Tauri rejects
 * invoke() with exactly this serialized object, not a plain string, so a
 * located failure can carry the line to jump the editor to. */
export interface PublishErrorPayload {
  code: string;
  message: string;
  line: number | null;
}

function isPublishErrorPayload(value: unknown): value is PublishErrorPayload {
  return (
    typeof value === 'object' &&
    value !== null &&
    'code' in value &&
    'message' in value &&
    typeof (value as { message: unknown }).message === 'string'
  );
}

export function describeExportError(error: unknown): string {
  return isPublishErrorPayload(error) ? error.message : String(error);
}

export function extractErrorLine(error: unknown): number | null {
  return isPublishErrorPayload(error) && typeof error.line === 'number' ? error.line : null;
}

/** Error codes remain structured across the native IPC boundary, allowing
 * the UI to offer a precise recovery action without parsing error text. */
export function extractErrorCode(error: unknown): string | null {
  return isPublishErrorPayload(error) && typeof error.code === 'string' ? error.code : null;
}

function preferredValue(value: string | undefined, fallback: string): string {
  return value?.trim() || fallback;
}

/** Same publishing-metadata-over-manuscript-metadata priority as EPUB's
 * createEpubMeta - Book Project's explicit values win, falling back to the
 * manuscript's own doc attributes, and only then to the SafeDocument's own
 * (already-normalized) metadata. */
export function mergedMetadata(
  document: SafeDocument,
  docMeta: AsciidocDocMeta,
  bookMetadata?: BookMetadata,
): SafeDocumentMetadata {
  return {
    title: preferredValue(
      bookMetadata?.title,
      preferredValue(docMeta.title, document.metadata.title || 'Untitled Document'),
    ),
    author: preferredValue(
      bookMetadata?.author,
      preferredValue(docMeta.author, document.metadata.author || 'Anonymous'),
    ),
    language: preferredValue(bookMetadata?.language, preferredValue(docMeta.lang, document.metadata.language || 'en')),
  };
}

/** Same shape as EPUB's own `EpubMeta` (createEpubMeta in epubExporter.ts) -
 * `title`/`author` reuse the already-merged `document.metadata` (Book
 * Project > manuscript attributes > SafeDocument default, see
 * `mergedMetadata`), while `subtitle`/`publisher` have no non-Book-Project
 * source to fall back to, same as EPUB's own handling of those two fields. */
function publicationAttribute(meta: AsciidocDocMeta, name: string): string {
  const value = meta.attributes[name];
  return typeof value === 'string' ? value.trim() : '';
}

function boundedCaption(meta: AsciidocDocMeta, name: string, fallback: string): string {
  const value = publicationAttribute(meta, name);
  // This text is only a presentation label, never document content. Keeping
  // it short also makes malformed attributes harmless before the native
  // compiler receives them.
  return value && value.length <= 80 ? value : fallback;
}

function tocDepth(meta: AsciidocDocMeta): number {
  const value = Number.parseInt(publicationAttribute(meta, 'toclevels'), 10);
  return Number.isInteger(value) && value >= 1 && value <= 6 ? value : 3;
}

function coverAsset(
  meta: AsciidocDocMeta,
  name: 'front-cover-image' | 'back-cover-image',
): Extract<SafeAssetRef, { kind: 'document-relative' }> | null {
  const reference = resolveSafeAssetRef(publicationAttribute(meta, name));
  return reference?.kind === 'document-relative' ? reference : null;
}

/** The only header attributes that influence the native publication layout. */
export function publicationOptionsFromMeta(meta: AsciidocDocMeta): PdfPublicationOptions {
  return {
    tocDepth: tocDepth(meta),
    figureCaption: boundedCaption(meta, 'figure-caption', 'Figure'),
    tableCaption: boundedCaption(meta, 'table-caption', 'Table'),
    exampleCaption: boundedCaption(meta, 'example-caption', 'Example'),
  };
}

/** Cover files take the same validated, document-relative asset path as body images. */
export function coverAssetReferences(meta: AsciidocDocMeta): SafeAssetRef[] {
  const front = coverAsset(meta, 'front-cover-image');
  const back = coverAsset(meta, 'back-cover-image');
  return [front, back].filter((asset): asset is NonNullable<typeof asset> => asset !== null);
}

export function createPdfCover(
  document: SafeDocument,
  docMeta: AsciidocDocMeta,
  bookMetadata?: BookMetadata,
): PdfCover {
  return {
    title: document.metadata.title,
    subtitle: bookMetadata?.subtitle ?? '',
    author: document.metadata.author,
    publisher: bookMetadata?.publisher ?? '',
    frontImagePath: coverAsset(docMeta, 'front-cover-image')?.relativePath ?? '',
    backImagePath: coverAsset(docMeta, 'back-cover-image')?.relativePath ?? '',
  };
}

/** Empty when there's no Book Project open - a document with citations but
 * no bibliography still publishes, just with every citation showing as
 * "Unresolved citation: key" (see safeHtmlRenderer.ts/typst_writer.rs's own
 * renderReferences/write_references), same graceful-degradation policy as
 * every other optional Book Project value this pipeline reads. */
export function createBibliography(bookMetadata?: BookMetadata): BibliographyEntry[] {
  return bookMetadata?.bibliography ?? [];
}

/**
 * Rust can't render Mermaid (mermaid.render() needs a real browser layout
 * engine), so every diagram in the document is rasterized to SVG here
 * first. The SVG is written to the app's own cache directory via
 * `@tauri-apps/plugin-fs` (capability-scoped to `$APPCACHE`, see
 * capabilities/default.json's `fs:allow-appcache-write-recursive`) and
 * bundled as a plain TypstAsset pointing at that file - the same
 * boundary-checked-path shape as a document-relative image, since assets no
 * longer carry bytes over IPC at all (see TypstAsset's own doc comment).
 * Rust re-validates this path is actually inside its own resolved app cache
 * directory before reading it (for the PDF path; the Typst-source-only path
 * doesn't read it at all - see generate_typst_source_sync's own comment).
 *
 * Throws rather than skipping a diagram that failed to render - by export
 * time the document is finalized (not still being typed, unlike the live
 * preview's own tolerance for transient syntax errors), so a null result
 * here means the diagram has a real syntax error that will never render.
 * Silently omitting it would ship an export quietly missing a diagram
 * instead of failing with a clear reason (DESIGN_GUIDELINES.md §7).
 */
export async function collectDiagramAssets(document: SafeDocument, themeId: ThemeInput): Promise<TypstAsset[]> {
  const codes = collectDiagramCodes(document);
  if (codes.length === 0) return [];

  const cacheDir = await appCacheDir();
  const assets: TypstAsset[] = [];
  for (const code of codes) {
    const svg = await renderMermaidToSvgString(code, themeId);
    if (!svg) {
      const preview = code.length > 60 ? `${code.slice(0, 60)}...` : code;
      throw new Error(`Failed to render Mermaid diagram for export: ${preview}`);
    }
    const relativePath = diagramAssetPath(code);
    const resolvedPath = `${cacheDir}/${relativePath}`;
    const dir = dirnameOf(resolvedPath);
    if (dir) await mkdir(dir, { recursive: true });
    await writeFile(resolvedPath, new TextEncoder().encode(svg));
    assets.push({ path: relativePath, resolvedPath, mediaType: 'image/svg+xml' });
  }
  return assets;
}
