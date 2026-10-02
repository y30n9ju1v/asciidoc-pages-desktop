import { useCallback, useEffect, useState } from 'react';
import { listDirectoryFromTauri } from '../services/fileTreeAdapter';
import {
  createNoteFromTemplate,
  deleteNoteTemplateFile,
  listNoteTemplates,
  saveNoteTemplate,
} from '../services/noteTemplateAdapter';
import type { NoteTemplate } from '../services/noteTemplateService';

async function reportedError<T>(setError: (message: string | null) => void, run: () => Promise<T>): Promise<T | null> {
  try {
    setError(null);
    return await run();
  } catch (error) {
    setError(error instanceof Error ? error.message : String(error));
    return null;
  }
}

/**
 * Owns note-template I/O and the async create/save/delete flows around it -
 * kept out of NoteTemplateDialog.tsx so that component stays a thin,
 * props-in/callbacks-out view, the same components -> hooks -> services
 * boundary every other dialog in this app already follows (compare
 * BibliographyDialog.tsx/BookDetailsDialog.tsx, which receive data and an
 * onSave callback rather than calling adapters directly).
 */
export function useNoteTemplates(vaultRoot: string | null, open: boolean) {
  const [templates, setTemplates] = useState<NoteTemplate[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!vaultRoot) return;
    const loaded = await reportedError(setError, () => listNoteTemplates(vaultRoot));
    if (loaded) setTemplates(loaded);
  }, [vaultRoot]);

  useEffect(() => {
    if (!open || !vaultRoot) return;
    let active = true;
    void listNoteTemplates(vaultRoot)
      .then((loaded) => {
        if (active) setTemplates(loaded);
      })
      .catch((reason) => {
        if (active) setError(reason instanceof Error ? reason.message : String(reason));
      });
    return () => {
      active = false;
    };
  }, [open, vaultRoot]);

  const createFrom = useCallback(
    async (template: NoteTemplate): Promise<string | null> => {
      if (!vaultRoot) return null;
      setBusy(true);
      const path = await reportedError(setError, async () => {
        const siblings = (await listDirectoryFromTauri(vaultRoot)).map((entry) => entry.name);
        return createNoteFromTemplate(vaultRoot, siblings, template);
      });
      setBusy(false);
      return path;
    },
    [vaultRoot],
  );

  const saveCurrentAsTemplate = useCallback(
    async (name: string, content: string): Promise<boolean> => {
      if (!vaultRoot || !name) return false;
      setBusy(true);
      // saveNoteTemplate resolves void, so a defined (non-null) result here
      // just means "didn't throw" - reportedError already routed any
      // failure into `error` state, this only decides whether the caller
      // should also clear its own input and whether to refresh the list.
      const succeeded = (await reportedError(setError, () => saveNoteTemplate(vaultRoot, name, content))) !== null;
      if (succeeded) await refresh();
      setBusy(false);
      return succeeded;
    },
    [vaultRoot, refresh],
  );

  const deleteTemplate = useCallback(
    async (name: string) => {
      if (!vaultRoot) return;
      setBusy(true);
      await reportedError(setError, () => deleteNoteTemplateFile(vaultRoot, name));
      await refresh();
      setBusy(false);
    },
    [vaultRoot, refresh],
  );

  return {
    templates,
    error,
    busy,
    createFrom,
    saveCurrentAsTemplate,
    deleteTemplate,
  };
}
