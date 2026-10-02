import { useCallback, useEffect, useRef, useState } from 'react';
import { indexVaultFromTauri } from '../services/vaultAdapter';
import type { VaultNote, VaultCache } from '../services/vaultService';
import { toast } from 'sonner';
import { syncVaultSearchIndex } from '../services/searchService';
import { chooseVaultFolderPath } from '../services/vaultDialogAdapter';

/** Returns indexed notes, or an empty list when no vault is available. */
async function loadVaultNotes(
  vaultRoot: string | null,
  cache: VaultCache,
  previous: Map<string, VaultNote>,
): Promise<VaultNote[] | null> {
  if (!vaultRoot) return [];
  try {
    const notes = await indexVaultFromTauri(vaultRoot, cache);
    try {
      await syncVaultSearchIndex(vaultRoot, notes, previous);
    } catch (err) {
      previous.clear();
      // The file-backed vault remains usable when its disposable index fails.
      console.error('Failed to update search index:', err);
      toast.error('Full-text search could not be updated', { description: 'Reopen the folder to retry.' });
    }
    return notes;
  } catch (err) {
    console.error('Failed to index vault:', err);
    toast.error('Vault refresh failed', { description: String(err) });
    return null;
  }
}

/** Keeps the explicitly selected, runtime-scoped vault for links and backlinks. */
export function useVault() {
  const [explicitRoot, setExplicitRoot] = useState<string | null>(null);
  const [notes, setNotes] = useState<VaultNote[]>([]);
  const requestIdRef = useRef(0);
  const cacheRef = useRef<VaultCache>(new Map());
  const indexedRef = useRef(new Map<string, VaultNote>());
  const queueRef = useRef(Promise.resolve());

  const vaultRoot = explicitRoot;

  // Lets save/create actions refresh links without changing the selected root.
  const refreshVault = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    const cache = cacheRef.current;
    const previous = indexedRef.current;
    const task = queueRef.current.then(async () => {
      if (requestId !== requestIdRef.current) return;
      const freshNotes = await loadVaultNotes(vaultRoot, cache, previous);
      if (requestId === requestIdRef.current && freshNotes) setNotes(freshNotes);
    });
    queueRef.current = task.catch(() => {});
    await task;
  }, [vaultRoot]);

  // Re-index on selection, app writes and window focus; unchanged bodies are cached.
  useEffect(() => {
    void refreshVault();
  }, [refreshVault]);

  useEffect(() => {
    const refresh = () => {
      void refreshVault();
    };
    window.addEventListener('focus', refresh);
    window.addEventListener('vault-files-changed', refresh);
    return () => {
      window.removeEventListener('focus', refresh);
      window.removeEventListener('vault-files-changed', refresh);
    };
  }, [refreshVault]);

  const chooseVaultFolder = async () => {
    // The native picker called by chooseVaultFolderPath grants this directory
    // fs scope recursively - required for nested notes,
    // includes, and images, none of which are readable without it.
    const selected = await chooseVaultFolderPath();
    if (selected) {
      // Invalidate any old asynchronous index before rendering the new vault.
      requestIdRef.current += 1;
      cacheRef.current = new Map();
      indexedRef.current = new Map();
      setNotes([]);
      setExplicitRoot(selected);
    }
  };

  return { vaultRoot, notes, chooseVaultFolder, refreshVault };
}
