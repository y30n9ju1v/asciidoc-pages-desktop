import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useTypstPdfPreview, type TypstPdfPreviewState } from './useTypstPdfPreview';
import { getPublicationStyle } from '../services/publicationStyleService';
import { createBookMetadata } from '../services/bookProjectService';
import type { AsciidocRenderResult } from '../services/asciidocService';

const mock = vi.hoisted(() => ({ compile: vi.fn(), remove: vi.fn(async () => {}) }));
vi.mock('../services/typstPreviewService', () => ({ compileTypstPreview: mock.compile }));
vi.mock('@tauri-apps/plugin-fs', () => ({ remove: mock.remove }));
const style = getPublicationStyle('literary');
const result: AsciidocRenderResult = {
  html: '',
  meta: { title: 'Book', author: '', email: '', lang: 'en', attributes: {} },
  safeDocument: { version: 1, metadata: { title: 'Book', author: '', language: 'en' }, blocks: [], diagnostics: [] },
};
const metadata = createBookMetadata(result.meta);
let root: Root;
let container: HTMLDivElement;
let state: TypstPdfPreviewState;
function Harness({ enabled, document = result }: { enabled: boolean; document?: AsciidocRenderResult }) {
  const preview = useTypstPdfPreview(document, '/vault/book.adoc', style, 'A4', metadata, '/vault', enabled);
  useEffect(() => {
    state = preview;
  }, [preview]);
  return null;
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  mock.compile.mockReset();
  mock.remove.mockClear();
  container = document.createElement('div');
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
async function advance(milliseconds: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(milliseconds);
  });
}

it('does not compile or refresh in write mode and cancels pending proof work', async () => {
  act(() => root.render(<Harness enabled={false} />));
  act(() => state.refresh());
  await advance(5000);
  expect(mock.compile).not.toHaveBeenCalled();
  act(() => root.render(<Harness enabled />));
  await advance(500);
  act(() => root.render(<Harness enabled={false} />));
  await advance(5000);
  expect(mock.compile).not.toHaveBeenCalled();
});

it('waits beyond 30 seconds for native completion, discards stale output and compiles only the latest document', async () => {
  let finish!: (path: string) => void;
  mock.compile
    .mockImplementationOnce(
      () =>
        new Promise<string>((resolve) => {
          finish = resolve;
        }),
    )
    .mockResolvedValueOnce('/cache/latest.pdf');
  act(() => root.render(<Harness enabled />));
  await advance(1800);
  act(() => root.render(<Harness enabled={false} />));
  const latest = { ...result, html: 'latest' };
  act(() => root.render(<Harness enabled document={latest} />));
  await advance(35000);
  expect(mock.compile).toHaveBeenCalledTimes(1);
  await act(async () => {
    finish('/cache/stale.pdf');
  });
  expect(mock.remove).toHaveBeenCalledWith('/cache/stale.pdf');
  expect(mock.compile).toHaveBeenCalledTimes(2);
  expect(mock.compile.mock.calls[1][0]).toBe(latest);
  expect(state.pdfPath).toBe('/cache/latest.pdf');
});

it('keeps the successful PDF while paused and discards work completing after unmount', async () => {
  mock.compile.mockResolvedValueOnce('/cache/success.pdf');
  act(() => root.render(<Harness enabled />));
  await advance(1800);
  act(() => root.render(<Harness enabled={false} />));
  expect(state.pdfPath).toBe('/cache/success.pdf');
  expect(state.isCompiling).toBe(false);
  expect(mock.remove).not.toHaveBeenCalled();
  let finish!: (path: string) => void;
  mock.compile.mockImplementationOnce(
    () =>
      new Promise<string>((resolve) => {
        finish = resolve;
      }),
  );
  act(() => root.render(<Harness enabled />));
  await advance(1800);
  act(() => root.render(null));
  await act(async () => {
    finish('/cache/disposed.pdf');
  });
  expect(mock.remove).toHaveBeenCalledWith('/cache/success.pdf');
  expect(mock.remove).toHaveBeenCalledWith('/cache/disposed.pdf');
});
