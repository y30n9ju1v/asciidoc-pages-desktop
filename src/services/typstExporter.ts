import { message } from '@tauri-apps/plugin-dialog';
import { copyFile, mkdir, writeTextFile } from '@tauri-apps/plugin-fs';
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'sonner';
import type { AsciidocDocMeta } from './asciidocService';
import type { SafeDocument } from './safeDocument';
import type { BookMetadata } from './bookProjectService';
import { getPublishTemplate, type PublishTemplateId } from './publishTemplateService';
import { getPageSize, type PageSizeId } from './pageSizeService';
import type { ThemeInput } from './themeService';
import type { PublicationStyleOption } from './publicationStyleService';
import { dirnameOf, resolveWithinRoot } from './pathSafety';
import { collectAssetReferences, loadPublicationAssets, type PdfPublicationRequest } from './pdfPublicationRequest';
import { chooseExportDirectory } from './publicationDialogAdapter';
import {
  collectDiagramAssets,
  coverAssetReferences,
  createBibliography,
  createPdfCover,
  describeExportError,
  mergedMetadata,
  publicationOptionsFromMeta,
} from './typstPublishing';

/** The main Typst file's name inside the exported project folder - mirrors
 * this app's own "main.adoc" convention for a multi-chapter manuscript's
 * entry point. */
const TYPST_MAIN_FILE_NAME = 'main.typ';

/**
 * Exports the Typst source `SafeDocument` would compile to as a standalone,
 * self-contained project folder: `main.typ` plus a copy of every local
 * image and pre-rendered Mermaid diagram it references, at the same
 * relative paths the source itself uses (`#image("images/cover.png", ...)`)
 * - so the folder can be compiled directly with a user's own Typst
 * toolchain (`typst compile main.typ`), not just inspected.
 *
 * Reuses the exact same request-building steps as `exportToPdf`
 * (`mergedMetadata`, `createPdfCover`, `loadPublicationAssets`,
 * `collectDiagramAssets`) so the generated source reflects the same
 * document, cover, and asset set a PDF export of the same document would -
 * only the Rust command differs: `generate_typst_source` returns the
 * source text directly (see its own doc comment for why that command does
 * no filesystem I/O of its own, unlike `compile_typst_pdf`), leaving this
 * function to actually write `main.typ` and copy each asset itself via the
 * capability-scoped fs plugin.
 */
export async function exportToTypst(
  safeDocument: SafeDocument,
  docMeta: AsciidocDocMeta,
  docPath: string | null,
  publishTemplateId: PublishTemplateId | PublicationStyleOption,
  pageSizeId: PageSizeId,
  themeId: ThemeInput,
  bookMetadata?: BookMetadata,
): Promise<boolean> {
  try {
    const document: SafeDocument = { ...safeDocument, metadata: mergedMetadata(safeDocument, docMeta, bookMetadata) };

    // A folder, not a single file: the export is a project (main.typ +
    // asset files at their own relative paths), not one document. Picking
    // it here (before the asset-loading/generation work) lets a cancelled
    // dialog skip that work entirely - same order as htmlExporter.ts/
    // epubExporter.ts.
    const destinationFolder = await chooseExportDirectory();
    if (!destinationFolder) return false;

    const imageAssets = loadPublicationAssets(
      [...collectAssetReferences(document), ...coverAssetReferences(docMeta)],
      docPath,
    );
    const diagramAssets = await collectDiagramAssets(document, themeId);
    const assets = [...imageAssets, ...diagramAssets];

    const request: PdfPublicationRequest = {
      document,
      template: getPublishTemplate(publishTemplateId),
      pageSize: getPageSize(pageSizeId),
      cover: createPdfCover(document, docMeta, bookMetadata),
      publication: publicationOptionsFromMeta(docMeta),
      assets,
      bibliography: createBibliography(bookMetadata),
      pdfA: false,
      documentRoot: docPath ? dirnameOf(docPath) : null,
    };

    const source = await invoke<string>('generate_typst_source', { requestJson: JSON.stringify(request) });

    await writeTextFile(`${destinationFolder}/${TYPST_MAIN_FILE_NAME}`, source);
    for (const asset of assets) {
      // `asset.path` is already trustworthy by construction here (a
      // validated SafeAssetRef's own relativePath, or diagramAssetPath()'s
      // hash-based name - neither can contain a traversal segment), but
      // per DESIGN_GUIDELINES.md §5 ("파일명, 상대 경로... 항상 검증된
      // 경로 유틸리티를 통과한다") every write target is re-verified here
      // too, the same defense-in-depth this codebase applies everywhere
      // else (isSafeAssetRef re-checking SafeAssetRef, Rust re-checking
      // document_root) rather than trusting an upstream guarantee holds
      // forever.
      const destinationPath = resolveWithinRoot(destinationFolder, asset.path, destinationFolder);
      if (!destinationPath) {
        throw new Error(`Refusing to write asset "${asset.path}" outside the export folder.`);
      }
      const destinationDir = dirnameOf(destinationPath);
      if (destinationDir) await mkdir(destinationDir, { recursive: true });
      await copyFile(asset.resolvedPath, destinationPath);
    }

    toast.success('Typst project exported', { description: destinationFolder.split('/').pop() });
    return true;
  } catch (error) {
    console.error('Failed to export Typst source:', error);
    await message('Error exporting Typst source: ' + describeExportError(error), {
      title: 'Export Failed',
      kind: 'error',
    });
    return false;
  }
}
