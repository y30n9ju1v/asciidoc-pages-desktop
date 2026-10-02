import { useCallback } from 'react';
import type { AsciidocRenderResult } from '../services/asciidocService';
import type { BookMetadata } from '../services/bookProjectService';
import { requireRenderedDocument } from '../services/exportGuard';
import type { PageSizeId } from '../services/pageSizeService';
import type { PublicationStyleOption } from '../services/publicationStyleService';

interface PublishExportOptions {
  renderResult: AsciidocRenderResult;
  currentPath: string | null;
  publicationStyle: PublicationStyleOption;
  pageSizeId: PageSizeId;
  bookMetadata: BookMetadata;
}

/** Coordinates non-PDF export user flows without giving the dialog I/O responsibilities. */
export function usePublishExports({
  renderResult,
  currentPath,
  publicationStyle,
  pageSizeId,
  bookMetadata,
}: PublishExportOptions) {
  const exportHtml = useCallback(() => {
    void import('../services/htmlExporter').then(({ exportToHtml }) =>
      exportToHtml(renderResult, currentPath, publicationStyle, pageSizeId),
    );
  }, [currentPath, pageSizeId, publicationStyle, renderResult]);

  const exportEpub = useCallback(() => {
    void requireRenderedDocument(renderResult).then((safeDocument) => {
      if (!safeDocument) return;
      void import('../services/epubExporter').then(({ exportToEpub }) =>
        exportToEpub(safeDocument, renderResult.meta, currentPath, publicationStyle, pageSizeId, bookMetadata),
      );
    });
  }, [bookMetadata, currentPath, pageSizeId, publicationStyle, renderResult]);

  const exportTypst = useCallback(() => {
    void requireRenderedDocument(renderResult).then((safeDocument) => {
      if (!safeDocument) return;
      void import('../services/typstExporter').then(({ exportToTypst }) =>
        exportToTypst(
          safeDocument,
          renderResult.meta,
          currentPath,
          publicationStyle,
          pageSizeId,
          publicationStyle,
          bookMetadata,
        ),
      );
    });
  }, [bookMetadata, currentPath, pageSizeId, publicationStyle, renderResult]);

  return { exportHtml, exportEpub, exportTypst };
}
