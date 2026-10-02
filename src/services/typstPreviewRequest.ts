import type { AsciidocRenderResult } from './asciidocService';
import type { BookMetadata } from './bookProjectService';
import type { PdfPublicationRequest, TypstAsset } from './pdfPublicationRequest';
import { getPageSize, type PageSizeId } from './pageSizeService';
import { getPublishTemplate, type PublishTemplateId } from './publishTemplateService';
import type { PublicationStyleOption } from './publicationStyleService';
import { dirnameOf } from './pathSafety';
import { createBibliography, createPdfCover, mergedMetadata, publicationOptionsFromMeta } from './typstPublishing';

export interface TypstPreviewRequestInput {
  renderResult: AsciidocRenderResult;
  docPath: string | null;
  templateId: PublishTemplateId | PublicationStyleOption;
  pageSizeId: PageSizeId;
  bookMetadata: BookMetadata;
  assets: TypstAsset[];
}

/** Purely turns already-prepared publication data into the Rust IPC contract. */
export function buildTypstPreviewRequest(input: TypstPreviewRequestInput): PdfPublicationRequest {
  const { renderResult, docPath, templateId, pageSizeId, bookMetadata, assets } = input;
  if (!renderResult.safeDocument) throw new Error('The document is not ready to preview yet.');

  const document = {
    ...renderResult.safeDocument,
    metadata: mergedMetadata(renderResult.safeDocument, renderResult.meta, bookMetadata),
  };
  return {
    document,
    template: getPublishTemplate(templateId),
    pageSize: getPageSize(pageSizeId),
    cover: createPdfCover(document, renderResult.meta, bookMetadata),
    publication: publicationOptionsFromMeta(renderResult.meta),
    assets,
    bibliography: createBibliography(bookMetadata),
    pdfA: false,
    documentRoot: docPath ? dirnameOf(docPath) : null,
  };
}
