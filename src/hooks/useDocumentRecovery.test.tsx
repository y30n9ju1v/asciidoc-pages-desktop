import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { ask } from '@tauri-apps/plugin-dialog';
import { useDocumentRecovery } from './useDocumentRecovery';
import { clearRecoverySnapshot, readRecoverySnapshot } from '../services/recoveryService';
vi.mock('@tauri-apps/plugin-dialog', () => ({ ask: vi.fn() }));
vi.mock('../services/recoveryService', () => ({
  readRecoverySnapshot: vi.fn(),
  clearRecoverySnapshot: vi.fn(),
  writeRecoverySnapshot: vi.fn(),
}));
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});
it.each([true, false])(
  'does not apply or discard recovery after editing while its prompt is pending (%s)',
  async (restore) => {
    vi.useFakeTimers();
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const snapshot = { content: 'old recovery', path: '/old.adoc', savedAt: 'today' };
    vi.mocked(readRecoverySnapshot).mockResolvedValue(snapshot);
    let answer!: (value: boolean) => void;
    vi.mocked(ask).mockReturnValue(
      new Promise((resolve) => {
        answer = resolve;
      }),
    );
    const revision = { current: 0 };
    const dispatch = vi.fn();
    const documentRefs = {
      content: { current: 'initial' },
      currentPath: { current: null },
      isDirty: { current: false },
    };
    function Harness() {
      useDocumentRecovery({ initialContent: 'initial', documentRefs, dispatch, revision });
      return null;
    }
    const root = createRoot(document.createElement('div'));
    try {
      await act(async () => {
        root.render(<Harness />);
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(500);
      });
      expect(ask).toHaveBeenCalledOnce();
      revision.current += 1;
      await act(async () => {
        answer(restore);
      });
      expect(dispatch).not.toHaveBeenCalled();
      expect(clearRecoverySnapshot).not.toHaveBeenCalled();
    } finally {
      act(() => root.unmount());
    }
  },
);
