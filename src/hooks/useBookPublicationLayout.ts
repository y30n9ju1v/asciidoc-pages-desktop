import { useState } from 'react';
import { publicationTarget } from '../services/publicationStatus';
import { DEFAULT_BOOK_LAYOUT, type BookPublicationLayout, type BookProject } from '../services/bookProjectService';

/** Vault-scoped drafts never modify the app defaults or another book. */
export function useBookPublicationLayout(
  root: string | null,
  project: BookProject | null,
  appLayout: BookPublicationLayout,
  changeAppLayout: (layout: BookPublicationLayout) => void,
  saveProject: (project: BookProject) => Promise<void>,
) {
  const [drafts, setDrafts] = useState<Record<string, BookPublicationLayout>>({});
  const saved = project?.publicationLayout ?? DEFAULT_BOOK_LAYOUT;
  const layout = root ? (drafts[root] ?? saved) : appLayout;
  const change = (next: BookPublicationLayout) => {
    if (!root) return changeAppLayout(next);
    setDrafts((current) => ({ ...current, [root]: next }));
  };
  const persist = async (next: BookProject) => {
    await saveProject({ ...next, publicationLayout: layout });
    if (!root) return;
    setDrafts((current) => {
      if (current[root] !== layout) return current;
      const remaining = { ...current };
      delete remaining[root];
      return remaining;
    });
  };
  return {
    layout,
    change,
    persist,
    scopeKey: root ?? 'single-document',
    target: publicationTarget(root, project?.metadata.title),
    dirty: !!root && (layout.styleId !== saved.styleId || layout.pageSizeId !== saved.pageSizeId),
  };
}
