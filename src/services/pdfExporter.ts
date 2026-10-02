import { message } from '@tauri-apps/plugin-dialog';
import { copyFile, exists, remove, rename } from '@tauri-apps/plugin-fs';
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'sonner';
import type { AsciidocDocMeta } from './asciidocService';
import type { SafeDocument } from './safeDocument';
import type { BookMetadata } from './bookProjectService';
import { getPublishTemplate, type PublishTemplateId } from './publishTemplateService';
import { getPageSize, type PageSizeId } from './pageSizeService';
import type { ThemeInput } from './themeService';
import type { PublicationStyleOption } from './publicationStyleService';
import { dirnameOf } from './pathSafety';
import { chooseExportFile } from './publicationDialogAdapter';
import { collectAssetReferences, loadPublicationAssets, type PdfPublicationRequest } from './pdfPublicationRequest';
import {
  collectDiagramAssets,
  coverAssetReferences,
  createBibliography,
  createPdfCover,
  describeExportError,
  extractErrorLine,
  mergedMetadata,
  publicationOptionsFromMeta,
} from './typstPublishing';

/** Mirrors the 3 phases `exportToPdf` actually goes through - derived from
 * its own Promise chain rather than a Tauri emit/listen event channel (this
 * app has no such infrastructure anywhere else, and a global progress event
 * would need a job ID to avoid two concurrent publishes mixing up their
 * state - see PublishDialog.tsx). */
export type PdfExportPhase = 'loading-assets' | 'compiling' | 'saving';

export interface PdfExportResult {
  success: boolean;
  /** A source line to jump the editor to, when the compiler failed with a
   * located error (e.g. nesting-depth-exceeded) - see PublishError in
   * publication_request.rs. */
  errorLine: number | null;
}

export interface PdfExportCallbacks {
  onPhaseChange?: (phase: PdfExportPhase) => void;
  /** Checked once, right before the compile is dispatched - cancellation is
   * only meaningful before compilation starts (there's no way to interrupt
   * an in-progress native Typst compile), so PublishDialog.tsx only offers
   * a Cancel button during the 'loading-assets' phase. */
  signal?: AbortSignal;
}

/**
 * Moves the compiled PDF from Rust's own temp file (see compile_typst_pdf's
 * own doc comment for why this crosses IPC as a path, not bytes) directly
 * onto `destination` - no differently-named temp file next to `destination`
 * itself, deliberately.
 *
 * That's not just simpler, it's required for this to actually work:
 * Rust owns the native save picker and grants the exact selected path only
 * after that picker resolves. A sibling like `${destination}.<uuid>.part`
 * is never granted, so renaming straight onto `destination` needs only the
 * cache-dir source (`fs:allow-appcache-write-recursive`) and the literal
 * destination selected by the user.
 *
 * `rename()` is used, not `copyFile()`, because POSIX rename atomically
 * replaces an existing same-filesystem destination in one step - so this
 * still can't leave `destination` as a partially-written file, without
 * needing a temp-then-rename dance at the destination at all. The one gap:
 * `rename` fails with EXDEV across filesystem/volume boundaries (an
 * external drive, a network share), in which case this falls back to a
 * direct `copyFile` - which does lose the atomicity guarantee for that
 * specific case (a failure mid-copy can leave `destination` partially
 * written). Accepted as the best achievable trade-off short of granting the
 * WebView broader fs scope than the exact path the user picked - but the
 * two ways that can go wrong are handled distinctly, not left as a generic
 * failure:
 *   - `destination` didn't exist before (a brand new export target): a
 *     failed copyFile can only leave debris at a path with nothing
 *     valuable to lose, so that debris is removed rather than left behind.
 *   - `destination` already existed (overwriting a previous PDF): a failed
 *     copyFile may have partially overwritten it, and there is no way to
 *     recover the original (scope permits touching only this exact path,
 *     so no backup-before-overwrite was possible) - this is surfaced as a
 *     distinct, more alarming error rather than a generic export failure,
 *     so the user knows to check/restore that file specifically.
 *
 * `sourcePath` (Rust's own scratch file) is always removed afterward
 * regardless of outcome - a successful rename already moved it away, so
 * this is a no-op then; it only actually cleans something up after the
 * EXDEV/copyFile fallback path.
 */
async function publishCompiledPdf(sourcePath: string, destination: string): Promise<void> {
  try {
    const renamed = await rename(sourcePath, destination).then(
      () => true,
      () => false,
    );
    if (renamed) return;

    const destinationExistedBefore = await exists(destination);
    try {
      await copyFile(sourcePath, destination);
    } catch (copyError) {
      if (!destinationExistedBefore) {
        await remove(destination).catch(() => {});
        throw copyError;
      }
      throw new Error(
        `Export failed partway through overwriting the existing file at this location, which may now be corrupted: ${describeExportError(copyError)}`,
        { cause: copyError },
      );
    }
  } finally {
    await remove(sourcePath).catch(() => {});
  }
}

function exportFileName(title: string): string {
  return `${(title || 'document').replace(/[\\/:*?"<>|]/g, '_')}.pdf`;
}

/**
 * Compiles the document to PDF via the native Rust Typst compiler and
 * writes it to a user-selected path. Unlike HTML/EPUB, this never builds
 * Typst source itself - it only assembles a PdfPublicationRequest (plain
 * SafeDocument JSON + boundary-checked asset file references, never bytes)
 * and hands it to the `compile_typst_pdf` Tauri command, which is the sole
 * place Typst markup is generated (see typst_writer.rs's own header comment
 * for why).
 *
 * `compile_typst_pdf` returns the path to a temp file Rust already wrote the
 * compiled PDF to under its own app cache directory - not the PDF bytes
 * themselves, so a document that can be hundreds of MB never has to be
 * copied into this process's JS heap at all. `publishCompiledPdf` moves that
 * temp file directly onto the user's chosen destination - see its own doc
 * comment for why a same-filesystem `rename()` (not a temp-file-plus-rename
 * dance at the destination) is both the correct atomicity story here and
 * the only shape that actually stays within the fs scope this function
 * explicitly grants for the destination.
 */
export async function exportToPdf(
  safeDocument: SafeDocument,
  docMeta: AsciidocDocMeta,
  docPath: string | null,
  publishTemplateId: PublishTemplateId | PublicationStyleOption,
  pageSizeId: PageSizeId,
  themeId: ThemeInput,
  pdfA: boolean,
  bookMetadata?: BookMetadata,
  callbacks?: PdfExportCallbacks,
): Promise<PdfExportResult> {
  const { onPhaseChange, signal } = callbacks ?? {};
  try {
    const document: SafeDocument = { ...safeDocument, metadata: mergedMetadata(safeDocument, docMeta, bookMetadata) };

    // Ask where to save before doing the expensive asset-loading/compile
    // work, same order as htmlExporter.ts/epubExporter.ts - a cancelled
    // dialog shouldn't have already paid for a Rust compile.
    const filePath = await chooseExportFile({
      defaultPath: exportFileName(document.metadata.title),
      filterName: 'PDF Document',
      extensions: ['pdf'],
    });
    if (!filePath) return { success: false, errorLine: null };

    onPhaseChange?.('loading-assets');
    const imageAssets = loadPublicationAssets(
      [...collectAssetReferences(document), ...coverAssetReferences(docMeta)],
      docPath,
    );
    const diagramAssets = await collectDiagramAssets(document, themeId);

    if (signal?.aborted) return { success: false, errorLine: null };

    const request: PdfPublicationRequest = {
      document,
      template: getPublishTemplate(publishTemplateId),
      pageSize: getPageSize(pageSizeId),
      cover: createPdfCover(document, docMeta, bookMetadata),
      publication: publicationOptionsFromMeta(docMeta),
      assets: [...imageAssets, ...diagramAssets],
      bibliography: createBibliography(bookMetadata),
      pdfA,
      documentRoot: docPath ? dirnameOf(docPath) : null,
    };

    onPhaseChange?.('compiling');
    const tempPdfPath = await invoke<string>('compile_typst_pdf', { requestJson: JSON.stringify(request) });

    onPhaseChange?.('saving');
    await publishCompiledPdf(tempPdfPath, filePath);

    toast.success('PDF published', { description: filePath.split('/').pop() });
    return { success: true, errorLine: null };
  } catch (error) {
    console.error('Failed to export PDF:', error);
    await message('Error exporting PDF: ' + describeExportError(error), { title: 'Export Failed', kind: 'error' });
    return { success: false, errorLine: extractErrorLine(error) };
  }
}
