import { act, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { useBookProject } from './useBookProject';
import { loadBookProject, saveBookProject } from '../services/bookProjectAdapter';
import { createBookProject } from '../services/bookProjectService';
vi.mock('../services/bookProjectAdapter', () => ({ loadBookProject: vi.fn(), saveBookProject: vi.fn() }));

it('does not replace the new folder project or its concurrency baseline after an old save finishes', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const a = createBookProject({ title: 'A', author: '', email: '', lang: 'en', attributes: {} });
  const b = { ...a, metadata: { ...a.metadata, title: 'B' } };
  vi.mocked(loadBookProject).mockImplementation(async (path) => ({ project: path === '/a' ? a : b, source: path }));
  let finish!: (value: string) => void;
  vi.mocked(saveBookProject)
    .mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    )
    .mockResolvedValue('/b-saved');
  let state!: ReturnType<typeof useBookProject>;
  function Harness({ folder }: { folder: string }) {
    const value = useBookProject(folder);
    useEffect(() => {
      state = value;
    }, [value]);
    return null;
  }
  const root = createRoot(document.createElement('div'));
  try {
    await act(async () => {
      root.render(<Harness folder="/a" />);
    });
    let saving!: Promise<void>;
    await act(async () => {
      saving = state.saveProject(a);
    });
    await act(async () => {
      root.render(<Harness folder="/b" />);
    });
    expect(state.project?.metadata.title).toBe('B');
    await act(async () => {
      finish('/a-saved');
      await saving;
    });
    expect(state.project?.metadata.title).toBe('B');
    await act(async () => {
      await state.saveProject(b);
    });
    expect(saveBookProject).toHaveBeenLastCalledWith('/b', b, '/b');
  } finally {
    act(() => root.unmount());
    vi.unstubAllGlobals();
  }
});
