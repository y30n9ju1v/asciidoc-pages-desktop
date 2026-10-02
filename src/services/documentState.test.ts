import { describe, expect, it } from 'vitest';
import { createDocumentState, documentReducer, isDocumentDirty } from './documentState';

describe('documentReducer', () => {
  it('tracks edits without changing the saved snapshot', () => {
    const state = documentReducer(createDocumentState('before'), { type: 'edit', content: 'after' });

    expect(state).toEqual({ content: 'after', savedContent: 'before', currentPath: null });
    expect(isDocumentDirty(state)).toBe(true);
  });

  it('marks only the snapshot written to disk as saved', () => {
    const writing = documentReducer(createDocumentState('first'), { type: 'edit', content: 'second' });
    const typedDuringSave = documentReducer(writing, { type: 'edit', content: 'third' });
    const saved = documentReducer(typedDuringSave, { type: 'save', content: 'second', path: '/book/doc.adoc' });

    expect(saved).toEqual({ content: 'third', savedContent: 'second', currentPath: '/book/doc.adoc' });
    expect(isDocumentDirty(saved)).toBe(true);
  });

  it('loads a new baseline and keeps recovered work dirty', () => {
    const loaded = documentReducer(createDocumentState('draft'), {
      type: 'load',
      content: 'on disk',
      path: '/book/doc.adoc',
    });
    const recovered = documentReducer(loaded, {
      type: 'recover',
      content: 'recovered unsaved work',
      path: '/book/doc.adoc',
    });

    expect(isDocumentDirty(loaded)).toBe(false);
    expect(isDocumentDirty(recovered)).toBe(true);
  });

  it('remaps a path without changing document contents', () => {
    const state = documentReducer(createDocumentState('text', '/book/old/doc.adoc'), {
      type: 'remap-path',
      path: '/book/new/doc.adoc',
    });

    expect(state).toEqual({ content: 'text', savedContent: 'text', currentPath: '/book/new/doc.adoc' });
  });
});
