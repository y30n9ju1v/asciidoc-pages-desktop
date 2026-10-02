import type { AsciidocRenderResult } from './asciidocService';
import type { BookMetadata } from './bookProjectService';
import { collectAssetReferences, loadPublicationAssets, type TypstAsset } from './pdfPublicationRequest';
import type { PageSizeId } from './pageSizeService';
import type { PublishTemplateId } from './publishTemplateService';
import type { ThemeInput } from './themeService';
import type { PublicationStyleOption } from './publicationStyleService';
import { collectDiagramAssets, coverAssetReferences } from './typstPublishing';
import { compileTypstPreviewPdf } from './typstPreviewCompilerAdapter';
import { buildTypstPreviewRequest } from './typstPreviewRequest';
import { measurePreviewStage } from './previewPerformance';

async function collectPreviewAssets(
  renderResult: AsciidocRenderResult,
  docPath: string | null,
  themeId: ThemeInput,
): Promise<TypstAsset[]> {
  if (!renderResult.safeDocument) throw new Error('The document is not ready to preview yet.');
  const document = renderResult.safeDocument;
  return [
    ...loadPublicationAssets(
      [...collectAssetReferences(document), ...coverAssetReferences(renderResult.meta)],
      docPath,
    ),
    ...(await collectDiagramAssets(document, themeId)),
  ];
}

/** Builds the exact request used for PDF publishing, but retains the result
 * in app cache for the in-app publication preview. */
export async function compileTypstPreview(
  renderResult: AsciidocRenderResult,
  docPath: string | null,
  templateId: PublishTemplateId | PublicationStyleOption,
  pageSizeId: PageSizeId,
  themeId: ThemeInput,
  bookMetadata: BookMetadata,
): Promise<string> {
  const assets = await measurePreviewStage('preview-assets', () =>
    collectPreviewAssets(renderResult, docPath, themeId),
  );
  return measurePreviewStage('native-pdf-roundtrip', () =>
    compileTypstPreviewPdf(
      buildTypstPreviewRequest({ renderResult, docPath, templateId, pageSizeId, bookMetadata, assets }),
    ),
  );
}
