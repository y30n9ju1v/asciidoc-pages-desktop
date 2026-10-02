import { convertFileSrc } from '@tauri-apps/api/core';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';
import { pdfCanvasScale } from './pdfPreviewZoom';
import { measurePreviewStage } from './previewPerformance';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export interface PdfCanvasRenderTask {
  completed: Promise<void>;
  cancel: () => Promise<void>;
}

interface StartPdfCanvasRenderInput {
  pdfPath: string;
  container: HTMLDivElement;
  scrollContainer: HTMLDivElement;
  zoom: number;
  devicePixelRatio: number;
  onRenderError: (error: unknown) => void;
}

interface PageSlot {
  pageNumber: number;
  element: HTMLDivElement;
  rendered: boolean;
  rendering: boolean;
}

function appendPageCanvas(
  container: HTMLElement,
  viewport: { width: number; height: number },
  devicePixelRatio: number,
) {
  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  canvas.style.width = `${viewport.width / devicePixelRatio}px`;
  canvas.style.height = `${viewport.height / devicePixelRatio}px`;
  canvas.className = 'mb-4 shadow-md';
  container.appendChild(canvas);
  return canvas;
}

function setSlotSize(slot: PageSlot, viewport: { width: number; height: number }, devicePixelRatio: number): void {
  slot.element.style.width = `${viewport.width / devicePixelRatio}px`;
  slot.element.style.height = `${viewport.height / devicePixelRatio}px`;
}

function createPageSlots(
  container: HTMLDivElement,
  pageCount: number,
  firstViewport: { width: number; height: number },
  devicePixelRatio: number,
): PageSlot[] {
  const slots: PageSlot[] = [];
  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    const element = document.createElement('div');
    element.className = 'mb-4 bg-white shadow-md';
    const slot = { pageNumber, element, rendered: false, rendering: false };
    setSlotSize(slot, firstViewport, devicePixelRatio);
    container.appendChild(element);
    slots.push(slot);
  }
  return slots;
}

async function renderSlot(
  slot: PageSlot,
  document: pdfjsLib.PDFDocumentProxy,
  scale: number,
  devicePixelRatio: number,
): Promise<void> {
  if (slot.rendered || slot.rendering) return;
  slot.rendering = true;
  try {
    const page = await document.getPage(slot.pageNumber);
    const viewport = page.getViewport({ scale });
    setSlotSize(slot, viewport, devicePixelRatio);
    const canvas = appendPageCanvas(slot.element, viewport, devicePixelRatio);
    await page.render({ canvas, viewport }).promise;
    slot.rendered = true;
  } finally {
    slot.rendering = false;
  }
}

function observeVisibleSlots(
  input: StartPdfCanvasRenderInput,
  slots: PageSlot[],
  document: pdfjsLib.PDFDocumentProxy,
  scale: number,
): () => void {
  if (!('IntersectionObserver' in window)) {
    for (const slot of slots) {
      void renderSlot(slot, document, scale, input.devicePixelRatio).catch(input.onRenderError);
    }
    return () => {};
  }

  const byElement = new Map(slots.map((slot) => [slot.element, slot]));
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const slot = byElement.get(entry.target as HTMLDivElement);
        if (slot) void renderSlot(slot, document, scale, input.devicePixelRatio).catch(input.onRenderError);
      }
    },
    { root: input.scrollContainer, rootMargin: '100% 0px' },
  );
  for (const slot of slots) observer.observe(slot.element);
  return () => observer.disconnect();
}

async function prepareVirtualizedPages(
  input: StartPdfCanvasRenderInput,
  document: pdfjsLib.PDFDocumentProxy,
): Promise<() => void> {
  const scale = pdfCanvasScale(input.zoom, input.devicePixelRatio);
  const firstPage = await document.getPage(1);
  const firstViewport = firstPage.getViewport({ scale });
  const slots = createPageSlots(input.container, document.numPages, firstViewport, input.devicePixelRatio);
  // The opening page is the essential success path. Render it before adding
  // the optional visibility observer: an observer setup problem must never
  // turn an otherwise valid PDF into an empty preview.
  await renderSlot(slots[0], document, scale, input.devicePixelRatio);
  try {
    return observeVisibleSlots(input, slots, document, scale);
  } catch (error) {
    // PDF.js has already rendered page one. Keep that useful preview visible
    // and report the virtualization degradation for diagnostics instead of
    // failing the entire document view.
    input.onRenderError(error);
    return () => {};
  }
}

/** Starts a cancellable pdf.js-to-canvas render for an asset-scoped PDF file. */
export function startPdfCanvasRender(input: StartPdfCanvasRenderInput): PdfCanvasRenderTask {
  const loadingTask = pdfjsLib.getDocument({ url: convertFileSrc(input.pdfPath) });
  let stopObserving = () => {};
  const completed = measurePreviewStage('pdf-first-page', () =>
    loadingTask.promise.then(async (document) => {
      stopObserving = await prepareVirtualizedPages(input, document);
    }),
  );
  return {
    completed,
    cancel: async () => {
      stopObserving();
      await loadingTask.destroy();
    },
  };
}
