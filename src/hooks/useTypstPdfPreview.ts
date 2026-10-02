import { type Dispatch, type RefObject, type SetStateAction, useCallback, useEffect, useRef, useState } from 'react';
import { remove } from '@tauri-apps/plugin-fs';
import type { AsciidocRenderResult } from '../services/asciidocService';
import type { BookMetadata } from '../services/bookProjectService';
import type { PageSizeId } from '../services/pageSizeService';
import type { PublicationStyleOption } from '../services/publicationStyleService';
import { describeExportError, extractErrorCode, extractErrorLine } from '../services/typstPublishing';
import { compileTypstPreview } from '../services/typstPreviewService';
import { LatestTaskQueue } from '../services/latestTaskQueue';

const PREVIEW_DEBOUNCE_MS = 1_800;
type PreviewPhase = 'waiting-for-document' | 'preparing-assets' | 'compiling' | 'ready' | 'failed';
export interface TypstPdfPreviewState {
  pdfPath: string | null;
  isCompiling: boolean;
  error: string | null;
  errorCode: string | null;
  errorLine: number | null;
  phase: PreviewPhase;
  refresh: () => void;
}

interface PreviewCompileInput {
  renderResult: AsciidocRenderResult;
  docPath: string | null;
  publicationStyle: PublicationStyleOption;
  pageSizeId: PageSizeId;
  bookMetadata: BookMetadata;
}

function createPreviewQueue(
  pdfPathRef: RefObject<string | null>,
  setState: Dispatch<SetStateAction<Omit<TypstPdfPreviewState, 'refresh'>>>,
): LatestTaskQueue<PreviewCompileInput, string> {
  return new LatestTaskQueue({
    delayMs: PREVIEW_DEBOUNCE_MS,
    run: compilePreview,
    onQueued: () =>
      setState((current) => ({
        ...current,
        phase: 'waiting-for-document',
        isCompiling: false,
        error: null,
        errorCode: null,
        errorLine: null,
      })),
    onStart: () => {
      setState((current) => ({
        ...current,
        isCompiling: true,
        error: null,
        errorCode: null,
        errorLine: null,
        phase: 'preparing-assets',
      }));
    },
    onSuccess: (pdfPath) => {
      const previousPath = pdfPathRef.current;
      pdfPathRef.current = pdfPath;
      if (previousPath && previousPath !== pdfPath) void remove(previousPath).catch(() => {});
      setState({ pdfPath, isCompiling: false, error: null, errorCode: null, errorLine: null, phase: 'ready' });
    },
    onDiscard: (pdfPath) => {
      void remove(pdfPath).catch(() => {});
    },
    onError: (error) => {
      setState((current) => ({
        ...current,
        isCompiling: false,
        error: describeExportError(error),
        errorCode: extractErrorCode(error),
        errorLine: extractErrorLine(error),
        phase: 'failed',
      }));
    },
  });
}

function removeCurrentPreviewPdf(pdfPathRef: RefObject<string | null>): void {
  const pdfPath = pdfPathRef.current;
  if (pdfPath) void remove(pdfPath).catch(() => {});
}

function compilePreview(input: PreviewCompileInput): Promise<string> {
  // Keep the queue occupied until native work really ends. A Promise.race
  // timeout cannot cancel Typst and would allow overlapping compilations.
  return compileTypstPreview(
    input.renderResult,
    input.docPath,
    input.publicationStyle,
    input.pageSizeId,
    input.publicationStyle,
    input.bookMetadata,
  );
}

/** Keeps the prior successful PDF visible while the next revision compiles. */
export function useTypstPdfPreview(
  renderResult: AsciidocRenderResult,
  docPath: string | null,
  publicationStyle: PublicationStyleOption,
  pageSizeId: PageSizeId,
  bookMetadata: BookMetadata,
  documentFolderScope: string | null,
  enabled = true,
): TypstPdfPreviewState {
  const [state, setState] = useState<Omit<TypstPdfPreviewState, 'refresh'>>({
    pdfPath: null,
    isCompiling: false,
    error: null,
    errorCode: null,
    errorLine: null,
    phase: 'waiting-for-document',
  });
  const pdfPathRef = useRef<string | null>(null);
  const [queue, setQueue] = useState<LatestTaskQueue<PreviewCompileInput, string> | null>(null);

  useEffect(() => {
    const previewQueue = createPreviewQueue(pdfPathRef, setState);
    setQueue(previewQueue);
    return () => {
      previewQueue.dispose();
      removeCurrentPreviewPdf(pdfPathRef);
    };
  }, []);

  useEffect(() => {
    if (!queue) return;
    if (!enabled || renderResult.renderError) {
      queue.clear();
      return;
    }
    if (!renderResult.safeDocument || renderResult.isPending) {
      queue.clear();
      return;
    }
    // A successful native folder selection changes this key without changing
    // the manuscript, so enqueue once more to retry assets under that newly
    // granted scope.
    queue.enqueue({ renderResult, docPath, publicationStyle, pageSizeId, bookMetadata });
  }, [renderResult, docPath, publicationStyle, pageSizeId, bookMetadata, documentFolderScope, queue, enabled]);

  const refresh = useCallback(() => {
    if (enabled) queue?.flush();
  }, [queue, enabled]);
  if (renderResult.isPending)
    return { ...state, phase: 'waiting-for-document', isCompiling: false, error: null, refresh };
  // A render-pipeline failure is derived from the current input, rather than
  // a separate async lifecycle. Deriving it here avoids a cascading update in
  // the effect and ensures the UI never remains on "Preparing" after a
  // failed include/image transform.
  if (renderResult.renderError) {
    return {
      ...state,
      isCompiling: false,
      error: renderResult.renderError,
      errorCode: null,
      errorLine: null,
      phase: 'failed',
      refresh,
    };
  }
  return { ...state, isCompiling: enabled && state.isCompiling, refresh };
}
