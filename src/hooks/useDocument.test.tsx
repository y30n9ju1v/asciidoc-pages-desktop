import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useDocument } from './useDocument';
import * as files from '../services/documentFileAdapter';
import { showDocumentError } from '../services/documentDialogAdapter';
import { clearRecoverySnapshot } from '../services/recoveryService';
import { saveDocumentSnapshot } from '../services/documentHistoryAdapter';

vi.mock('../services/documentFileAdapter', () => ({
  chooseDocumentSavePath: vi.fn(),
  chooseDocumentToOpen: vi.fn(),
  documentExists: vi.fn(),
  readDocumentText: vi.fn(),
  writeDocumentText: vi.fn(),
}));
vi.mock('../services/documentDialogAdapter', () => ({
  confirmDiscardChanges: vi.fn(async () => true),
  showDocumentError: vi.fn(),
}));
vi.mock('../services/documentHistoryAdapter', () => ({ saveDocumentSnapshot: vi.fn() }));
vi.mock('../services/recoveryService', () => ({ clearRecoverySnapshot: vi.fn() }));
vi.mock('./useDocumentRecovery', () => ({ useDocumentRecovery: vi.fn() }));
vi.mock('./useDocumentCloseGuard', () => ({ useDocumentCloseGuard: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: vi.fn() } }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
let root: Root;
let document: ReturnType<typeof useDocument>;
function Harness() {
  const state = useDocument('Initial', '/book');
  useEffect(() => {
    document = state;
  }, [state]);
  return null;
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.clearAllMocks();
  vi.mocked(files.documentExists).mockResolvedValue(false);
  vi.mocked(files.writeDocumentText).mockResolvedValue(undefined);
  vi.mocked(files.readDocumentText).mockResolvedValue('On disk');
  vi.mocked(files.chooseDocumentSavePath).mockResolvedValue('/book/new.adoc');
  vi.mocked(clearRecoverySnapshot).mockResolvedValue(undefined);
  root = createRoot(window.document.createElement('div'));
  act(() => root.render(<Harness />));
});
afterEach(() => {
  act(() => root.unmount());
  vi.unstubAllGlobals();
});

it.each(['Permission denied', 'Disk full', 'External modification conflict'])(
  'preserves dirty content and recovery on save failure: %s',
  async (message) => {
    await act(async () => {
      await document.openFile('/book/original.adoc');
    });
    act(() => document.setContent('Unsaved manuscript'));
    vi.mocked(clearRecoverySnapshot).mockClear();
    vi.mocked(files.writeDocumentText).mockRejectedValueOnce(new Error(message));
    await act(async () => {
      await document.saveDocument();
    });
    expect(document.content).toBe('Unsaved manuscript');
    expect(document.currentPath).toBe('/book/original.adoc');
    expect(document.isDirty).toBe(true);
    expect(clearRecoverySnapshot).not.toHaveBeenCalled();
    expect(showDocumentError).toHaveBeenCalledWith('Save Failed', expect.any(Error));
    await act(async () => {
      await document.saveDocument();
    });
    expect(files.writeDocumentText).toHaveBeenLastCalledWith('/book/original.adoc', 'Unsaved manuscript', 'On disk');
    expect(document.isDirty).toBe(false);
  },
);

it('keeps typing during a save dirty and permits only one simultaneous save', async () => {
  const writing = deferred<void>();
  vi.mocked(files.writeDocumentText).mockReturnValueOnce(writing.promise);
  act(() => document.setContent('Version one'));
  let saving!: Promise<void>;
  await act(async () => {
    saving = document.saveDocument();
  });
  act(() => document.setContent('Version two'));
  await act(async () => {
    await document.saveDocument();
  });
  expect(files.writeDocumentText).toHaveBeenCalledTimes(1);
  await act(async () => {
    writing.resolve();
    await saving;
  });
  expect(document.content).toBe('Version two');
  expect(document.isDirty).toBe(true);
  expect(clearRecoverySnapshot).not.toHaveBeenCalled();
});

it('does not apply a completed save to a newly opened document', async () => {
  const writing = deferred<void>();
  vi.mocked(files.writeDocumentText).mockReturnValueOnce(writing.promise);
  act(() => document.setContent('Old draft'));
  let saving!: Promise<void>;
  await act(async () => {
    saving = document.saveDocument();
  });
  await act(async () => {
    await document.openFile('/book/other.adoc');
  });
  await act(async () => {
    writing.resolve();
    await saving;
  });
  expect(document.currentPath).toBe('/book/other.adoc');
  expect(document.content).toBe('On disk');
});

it('ignores an older file read that completes after the latest open', async () => {
  const reading = deferred<string>();
  vi.mocked(files.readDocumentText).mockReturnValueOnce(reading.promise);
  let opening!: Promise<void>;
  await act(async () => {
    opening = document.openFile('/book/old.adoc');
  });
  await act(async () => {
    await document.openFile('/book/latest.adoc');
  });
  await act(async () => {
    reading.resolve('Obsolete');
    await opening;
  });
  expect(document.currentPath).toBe('/book/latest.adoc');
  expect(document.content).toBe('On disk');
});

it('does not discard edits made while an open request is reading', async () => {
  const reading = deferred<string>();
  vi.mocked(files.readDocumentText).mockReturnValueOnce(reading.promise);
  let opening!: Promise<void>;
  await act(async () => {
    opening = document.openFile('/book/slow.adoc');
  });
  act(() => document.setContent('New typing'));
  await act(async () => {
    reading.resolve('Obsolete');
    await opening;
  });
  expect(document.content).toBe('New typing');
  expect(document.isDirty).toBe(true);
});

it('does not write when the save picker is cancelled or history backup fails', async () => {
  act(() => document.setContent('Keep this draft'));
  vi.mocked(files.chooseDocumentSavePath).mockResolvedValueOnce(null);
  await act(async () => {
    await document.saveDocument();
  });
  expect(files.writeDocumentText).not.toHaveBeenCalled();
  expect(document.isDirty).toBe(true);
  vi.mocked(files.documentExists).mockResolvedValue(true);
  vi.mocked(saveDocumentSnapshot).mockRejectedValueOnce(new Error('History disk full'));
  await act(async () => {
    await document.saveDocument();
  });
  expect(files.writeDocumentText).not.toHaveBeenCalled();
  expect(document.content).toBe('Keep this draft');
  expect(clearRecoverySnapshot).not.toHaveBeenCalled();
});
