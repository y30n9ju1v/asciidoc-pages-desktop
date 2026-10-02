import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import type { BookProject } from '../services/bookProjectService';
import { loadBookProject, saveBookProject } from '../services/bookProjectAdapter';

/** Persists book-only metadata next to a vault without altering manuscript files. */
export function useBookProject(vaultRoot: string | null) {
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const reload = () => setRevision((value) => value + 1);
    window.addEventListener('vault-files-changed', reload);
    return () => window.removeEventListener('vault-files-changed', reload);
  }, []);
  const stored = useRef<{ root: string; source: string | null } | null>(null);
  const saving = useRef(false);
  const scopeRevision = useRef(0);
  const [loadedProject, setLoadedProject] = useState<{ vaultRoot: string; project: BookProject | null } | null>(null);

  useEffect(() => {
    scopeRevision.current += 1;
    let cancelled = false;
    if (!vaultRoot) return;

    stored.current = null;
    void loadBookProject(vaultRoot)
      .then((loaded) => {
        if (!cancelled) {
          stored.current = { root: vaultRoot, source: loaded.source };
          setLoadedProject({ vaultRoot, project: loaded.project });
        }
      })
      .catch((error) => {
        console.error('Failed to load book project:', error);
        if (!cancelled) toast.error('Could not load book details', { description: String(error) });
        if (!cancelled) setLoadedProject({ vaultRoot, project: null });
      });

    return () => {
      cancelled = true;
    };
  }, [vaultRoot, revision]);

  const saveProject = useCallback(
    async (nextProject: BookProject): Promise<void> => {
      if (!vaultRoot) throw new Error('Open a book folder before saving book details.');

      if (saving.current) throw new Error('A book save is already in progress.');
      if (stored.current?.root !== vaultRoot) throw new Error('Book details are not ready. Reopen the Vault.');
      saving.current = true;
      const revisionAtSave = scopeRevision.current;
      try {
        const source = await saveBookProject(vaultRoot, nextProject, stored.current.source);
        if (revisionAtSave !== scopeRevision.current) return;
        stored.current = { root: vaultRoot, source };
        setLoadedProject({ vaultRoot, project: nextProject });
      } finally {
        saving.current = false;
      }
    },
    [vaultRoot],
  );

  const project = loadedProject?.vaultRoot === vaultRoot ? loadedProject.project : null;
  return { project, saveProject };
}
