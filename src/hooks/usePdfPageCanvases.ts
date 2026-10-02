import { useEffect, useRef, useState } from 'react';
import { startPdfCanvasRender } from '../services/pdfCanvasRenderer';

export interface PdfPageCanvases {
  containerRef: React.RefObject<HTMLDivElement | null>;
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  renderError: string | null;
}

/** Owns the browser canvas lifecycle while keeping PDF.js out of the UI component. */
export function usePdfPageCanvases(pdfPath: string | null, zoom: number): PdfPageCanvases {
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [renderError, setRenderError] = useState<string | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    const scrollContainer = scrollContainerRef.current;
    if (!pdfPath || !container || !scrollContainer) return;

    let cancelled = false;
    container.replaceChildren();
    setRenderError(null);
    const renderTask = startPdfCanvasRender({
      pdfPath,
      container,
      scrollContainer,
      zoom,
      devicePixelRatio: window.devicePixelRatio,
      onRenderError: (error) => {
        if (!cancelled) setRenderError(error instanceof Error ? error.message : String(error));
      },
    });
    void renderTask.completed.catch((error: unknown) => {
      if (!cancelled) setRenderError(error instanceof Error ? error.message : String(error));
    });

    return () => {
      cancelled = true;
      void renderTask.cancel();
    };
  }, [pdfPath, zoom]);

  return { containerRef, scrollContainerRef, renderError };
}
