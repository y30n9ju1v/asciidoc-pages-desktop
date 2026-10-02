import { act, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { useBookPublicationLayout } from './useBookPublicationLayout';
import {
  createBookProject,
  parseBookProject,
  serializeBookProject,
  type BookProject,
} from '../services/bookProjectService';
import { useProjectPublicationTypography } from './useProjectPublicationTypography';
import { getPublicationStyle } from '../services/publicationStyleService';
import { previewStatusText } from '../services/publicationStatus';

const meta = { title: 'Book', author: '', email: '', lang: 'en', attributes: {} };
const original = createBookProject(meta);
afterEach(() => vi.unstubAllGlobals());

it('round-trips book layout, accepts old books, and rejects invalid settings', () => {
  const project: BookProject = { ...original, publicationLayout: { styleId: 'literary', pageSizeId: 'A5' } };
  expect(parseBookProject(serializeBookProject(project))?.publicationLayout).toEqual(project.publicationLayout);
  expect(parseBookProject(serializeBookProject(original))?.publicationLayout).toBeUndefined();
  expect(
    parseBookProject(JSON.stringify({ ...project, publicationLayout: { styleId: 'evil', pageSizeId: 'huge' } }))
      ?.publicationLayout,
  ).toBeUndefined();
});

it('isolates book drafts, preserves failed saves, and uses app defaults only outside a Vault', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const root = createRoot(document.createElement('div'));
  const save = vi.fn(async (_project: BookProject) => {});
  const changeDefaults = vi.fn();
  let layout!: ReturnType<typeof useBookPublicationLayout>;
  function Harness({ vault, project = original }: { vault: string | null; project?: BookProject }) {
    const state = useBookPublicationLayout(
      vault,
      project,
      { styleId: 'reference', pageSizeId: 'Letter' },
      changeDefaults,
      save,
    );
    useEffect(() => {
      layout = state;
    }, [state]);
    return null;
  }
  try {
    act(() => root.render(<Harness vault="/a" />));
    act(() => layout.change({ styleId: 'literary', pageSizeId: 'A5' }));
    act(() => root.render(<Harness vault="/b" />));
    expect(layout.layout.pageSizeId).toBe('B5');
    act(() => root.render(<Harness vault="/a" />));
    expect(layout.layout.pageSizeId).toBe('A5');
    expect(changeDefaults).not.toHaveBeenCalled();
    save.mockRejectedValueOnce(new Error('disk full'));
    await act(async () => {
      await expect(layout.persist(original)).rejects.toThrow('disk full');
    });
    expect(layout.dirty).toBe(true);
    await act(async () => {
      await layout.persist(original);
    });
    const saved = save.mock.calls[save.mock.calls.length - 1][0];
    expect(saved.publicationLayout).toEqual({ styleId: 'literary', pageSizeId: 'A5' });
    act(() => root.render(<Harness vault="/a" project={saved} />));
    expect(layout.dirty).toBe(false);
    expect(layout.layout.pageSizeId).toBe('A5');
    act(() => root.render(<Harness vault={null} />));
    expect(layout.layout.pageSizeId).toBe('Letter');
  } finally {
    act(() => root.unmount());
  }
});

it('does not lose typography edits made during save or leak them to another book', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const root = createRoot(document.createElement('div'));
  let finish!: () => void;
  const save = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  let state!: ReturnType<typeof useProjectPublicationTypography>;
  function Harness({ scope }: { scope: string }) {
    const current = useProjectPublicationTypography({
      scopeKey: scope,
      styleId: 'literary',
      style: getPublicationStyle('literary'),
      savedProject: original,
      manuscriptMetadata: meta,
      saveProject: save,
    });
    useEffect(() => {
      state = current;
    }, [current]);
    return null;
  }
  try {
    act(() => root.render(<Harness scope="a" />));
    act(() => state.change({ ...state.typography, baseFontSizePt: 13 }));
    let pending!: Promise<boolean>;
    act(() => {
      pending = state.save();
    });
    expect(state.saving).toBe(true);
    act(() => state.change({ ...state.typography, baseFontSizePt: 15 }));
    await act(async () => {
      finish();
      await pending;
    });
    expect(state.typography.baseFontSizePt).toBe(15);
    act(() => root.render(<Harness scope="b" />));
    expect(state.override).toBeNull();
    act(() => root.render(<Harness scope="a" />));
    expect(state.typography.baseFontSizePt).toBe(15);
  } finally {
    act(() => root.unmount());
  }
});

it('never reports the old PDF as current while input is pending or generation failed', () => {
  const ready = { error: null, isCompiling: false, phase: 'ready' };
  expect(previewStatusText(true, ready, true)).toBe('Preview pending');
  expect(previewStatusText(true, { ...ready, error: 'failed' }, false)).toBe('Preview failed');
  expect(previewStatusText(false, ready, false)).toBe('Preview paused');
  expect(previewStatusText(true, { ...ready, isCompiling: true }, false)).toBe('Generating PDF…');
  expect(previewStatusText(true, ready, false)).toBe('PDF up to date');
});
