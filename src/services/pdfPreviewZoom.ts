export const DEFAULT_PDF_PREVIEW_ZOOM = 0.8;
export const MIN_PDF_PREVIEW_ZOOM = 0.5;
export const MAX_PDF_PREVIEW_ZOOM = 1.5;
const PDF_PREVIEW_ZOOM_STEP = 0.1;

export function clampPdfPreviewZoom(zoom: number): number {
  return Math.min(MAX_PDF_PREVIEW_ZOOM, Math.max(MIN_PDF_PREVIEW_ZOOM, zoom));
}

export function changePdfPreviewZoom(currentZoom: number, direction: -1 | 1): number {
  return clampPdfPreviewZoom(Number((currentZoom + direction * PDF_PREVIEW_ZOOM_STEP).toFixed(2)));
}

/** Uses device pixels for crisp canvas text while preserving the requested CSS size. */
export function pdfCanvasScale(zoom: number, devicePixelRatio: number): number {
  return clampPdfPreviewZoom(zoom) * Math.max(devicePixelRatio, 1);
}
