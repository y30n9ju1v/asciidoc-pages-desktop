import { describe, expect, it } from 'vitest';
import { DEFAULT_PDF_PREVIEW_ZOOM, changePdfPreviewZoom, clampPdfPreviewZoom, pdfCanvasScale } from './pdfPreviewZoom';

describe('PDF preview zoom', () => {
  it('starts zoomed out and keeps changes within the supported range', () => {
    expect(DEFAULT_PDF_PREVIEW_ZOOM).toBeLessThan(1);
    expect(changePdfPreviewZoom(0.5, -1)).toBe(0.5);
    expect(changePdfPreviewZoom(1.5, 1)).toBe(1.5);
    expect(clampPdfPreviewZoom(0)).toBe(0.5);
  });

  it('uses the display pixel ratio only for canvas resolution, not CSS layout size', () => {
    expect(pdfCanvasScale(0.8, 2)).toBe(1.6);
  });
});
