import { useState, type MouseEvent } from 'react';
import { Copy, LoaderCircle, Minus, Plus, RefreshCw, RotateCcw, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';
import type { TypstPdfPreviewState } from '../../hooks/useTypstPdfPreview';
import { usePdfPageCanvases } from '../../hooks/usePdfPageCanvases';
import { copyTextToClipboard } from '../../services/clipboardService';
import {
  DEFAULT_PDF_PREVIEW_ZOOM,
  MAX_PDF_PREVIEW_ZOOM,
  MIN_PDF_PREVIEW_ZOOM,
  changePdfPreviewZoom,
} from '../../services/pdfPreviewZoom';

interface TypstPdfPreviewProps extends TypstPdfPreviewState {
  onJumpToLine: (line: number) => void;
  onOpenFolder: () => void;
}

interface PdfPreviewToolbarProps {
  zoom: number;
  isCompiling: boolean;
  onRefresh: () => void;
  onZoomChange: (zoom: number) => void;
}

function PdfPreviewToolbar({ zoom, isCompiling, onRefresh, onZoomChange }: PdfPreviewToolbarProps) {
  return (
    <div className="sticky top-0 z-10 mb-3 flex justify-end">
      <div className="flex items-center gap-1 rounded-md border bg-background/95 p-1 shadow-sm backdrop-blur">
        <button
          aria-label="Refresh PDF preview"
          className="rounded-sm p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
          onClick={onRefresh}
          title="Refresh PDF preview now"
          type="button"
        >
          <RefreshCw className={`size-3.5 ${isCompiling ? 'animate-spin' : ''}`} />
        </button>
        <button
          aria-label="Zoom out PDF preview"
          className="rounded-sm p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40"
          disabled={zoom <= MIN_PDF_PREVIEW_ZOOM}
          onClick={() => onZoomChange(changePdfPreviewZoom(zoom, -1))}
          title="Zoom out"
          type="button"
        >
          <Minus className="size-3.5" />
        </button>
        <button
          className="min-w-12 rounded-sm px-1.5 py-1 text-xs tabular-nums hover:bg-accent"
          onClick={() => onZoomChange(1)}
          title="Reset to 100%"
          type="button"
        >
          {Math.round(zoom * 100)}%
        </button>
        <button
          aria-label="Zoom in PDF preview"
          className="rounded-sm p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40"
          disabled={zoom >= MAX_PDF_PREVIEW_ZOOM}
          onClick={() => onZoomChange(changePdfPreviewZoom(zoom, 1))}
          title="Zoom in"
          type="button"
        >
          <Plus className="size-3.5" />
        </button>
        <button
          aria-label="Reset PDF preview zoom"
          className="rounded-sm p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
          onClick={() => onZoomChange(DEFAULT_PDF_PREVIEW_ZOOM)}
          title="Fit default size"
          type="button"
        >
          <RotateCcw className="size-3.5" />
        </button>
      </div>
    </div>
  );
}

interface PdfPreviewErrorBannerProps {
  error: string;
  errorLine: number | null;
  onJumpToLine: (line: number) => void;
}

function PdfPreviewErrorBanner({ error, errorLine, onJumpToLine }: PdfPreviewErrorBannerProps) {
  const text = `${error}${errorLine !== null ? ` (line ${errorLine})` : ''}`;
  const copyError = async (event: MouseEvent) => {
    event.stopPropagation();
    if (await copyTextToClipboard(text)) {
      toast.success('Error copied');
    } else {
      toast.error('Could not copy the error message');
    }
  };
  return (
    <div className="absolute inset-x-3 bottom-3 flex items-start gap-2 rounded-md border border-destructive/30 bg-background/95 p-3 text-left text-xs text-destructive shadow-sm">
      <TriangleAlert className="mt-0.5 size-4 shrink-0" />
      {errorLine !== null ? (
        <button className="min-w-0 flex-1 break-words text-left" onClick={() => onJumpToLine(errorLine)} type="button">
          {text}
        </button>
      ) : (
        <p className="min-w-0 flex-1 select-text break-words">{text}</p>
      )}
      <button
        aria-label="Copy error message"
        className="shrink-0 rounded-sm p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
        onClick={copyError}
        title="Copy error message"
        type="button"
      >
        <Copy className="size-3.5" />
      </button>
    </div>
  );
}

/** Folder access is a recovery action, not part of the error-message controls. */
function PdfPreviewFolderAccessNotice({ onOpenFolder }: { onOpenFolder: () => void }) {
  return (
    <section className="absolute inset-x-6 top-1/2 z-10 -translate-y-1/2 rounded-lg border bg-background/95 p-4 text-center shadow-sm">
      <h2 className="text-sm font-semibold">Folder access required</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Choose the folder containing this document to include its local images in the PDF preview.
      </p>
      <button
        className="mt-3 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
        onClick={onOpenFolder}
        type="button"
      >
        Open folder
      </button>
    </section>
  );
}

export function TypstPdfPreview({
  pdfPath,
  isCompiling,
  error,
  errorCode,
  errorLine,
  refresh,
  onJumpToLine,
  onOpenFolder,
}: TypstPdfPreviewProps) {
  const [zoom, setZoom] = useState(DEFAULT_PDF_PREVIEW_ZOOM);
  const { containerRef, scrollContainerRef, renderError } = usePdfPageCanvases(pdfPath, zoom);
  const progressMessage = isCompiling ? 'Generating the print-ready PDF…' : 'Waiting for the document renderer…';
  const displayedError = error ?? renderError;
  const requiresFolderAccess = errorCode === 'asset-outside-allowed-root';

  return (
    <div
      ref={scrollContainerRef}
      className="preview-container relative h-full w-full overflow-auto bg-[var(--bg-preview)] p-4"
    >
      {pdfPath ? (
        <PdfPreviewToolbar zoom={zoom} isCompiling={isCompiling} onRefresh={refresh} onZoomChange={setZoom} />
      ) : null}
      <div ref={containerRef} className="flex flex-col items-center" />
      {isCompiling ? (
        <div className="absolute left-3 top-3 flex items-center gap-2 rounded-md bg-background/95 px-3 py-2 text-xs shadow-sm">
          <LoaderCircle className="size-3.5 animate-spin" />
          {progressMessage}
        </div>
      ) : null}
      {displayedError ? (
        <PdfPreviewErrorBanner error={displayedError} errorLine={errorLine} onJumpToLine={onJumpToLine} />
      ) : null}
      {requiresFolderAccess ? <PdfPreviewFolderAccessNotice onOpenFolder={onOpenFolder} /> : null}
      {!pdfPath && !isCompiling && !error ? (
        <div className="p-6 text-sm text-muted-foreground">Waiting for the document renderer…</div>
      ) : null}
    </div>
  );
}
