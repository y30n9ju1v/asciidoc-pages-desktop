import { useRef, useState } from 'react';
import type { AsciidocRenderResult } from '../services/asciidocService';
import type { BookMetadata } from '../services/bookProjectService';
import type { PageSizeId } from '../services/pageSizeService';
import type { PdfExportPhase } from '../services/pdfExporter';
import type { PublicationStyleOption } from '../services/publicationStyleService';
import { requireRenderedDocument } from '../services/exportGuard';

/** Owns the PDF export lifecycle (phase state, cancellation, jump-to-line on
 * a located failure) - a stateful, async user-flow concern, so it lives here
 * rather than inline in PublishDialog.tsx (DESIGN_GUIDELINES.md §2: "hooks/
 * 는 React 상태와 비동기 사용자 흐름의 경계다"), matching every other
 * stateful hook in this app (useDocument, useVault, ...). */
export function usePdfExport(
  renderResult: AsciidocRenderResult,
  currentPath: string | null,
  currentPublicationStyle: PublicationStyleOption,
  currentPageSize: PageSizeId,
  pdfA: boolean,
  bookMetadata: BookMetadata,
  onJumpToLine: (lineNumber: number) => void,
  onDialogClose: () => void,
) {
  const [pdfPhase, setPdfPhase] = useState<PdfExportPhase | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const exportPdf = () => {
    void requireRenderedDocument(renderResult).then((safeDocument) => {
      if (!safeDocument) return;
      const controller = new AbortController();
      abortControllerRef.current = controller;
      setPdfPhase('loading-assets');
      void import('../services/pdfExporter').then(({ exportToPdf }) =>
        exportToPdf(
          safeDocument,
          renderResult.meta,
          currentPath,
          currentPublicationStyle,
          currentPageSize,
          currentPublicationStyle,
          pdfA,
          bookMetadata,
          { onPhaseChange: setPdfPhase, signal: controller.signal },
        ).then((result) => {
          abortControllerRef.current = null;
          setPdfPhase(null);
          if (result.success || result.errorLine === null) return;
          onDialogClose();
          onJumpToLine(result.errorLine);
        }),
      );
    });
  };

  // Cancellation is only meaningful before the native Typst compile starts
  // (there's no way to interrupt it once invoke() has been called) - the
  // Cancel button is only rendered during the 'loading-assets' phase, so
  // this never fires once compilation is underway.
  const cancelPdfExport = () => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setPdfPhase(null);
  };

  return { pdfPhase, exportPdf, cancelPdfExport };
}
