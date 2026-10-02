import { useEffect, useState } from 'react';
import { listDirectoryFromTauri } from '../services/fileTreeAdapter';
import type { FileTreeEntry } from '../services/fileTreeService';

interface DirectoryEntriesState {
  entries: FileTreeEntry[];
  loading: boolean;
  error: string | null;
}

const EMPTY_DIRECTORY: DirectoryEntriesState = { entries: [], loading: false, error: null };

/** Loads one visible directory and discards late results when its identity changes. */
export function useDirectoryEntries(
  directoryPath: string | null,
  refreshToken: number,
  enabled = true,
): DirectoryEntriesState {
  const [state, setState] = useState<DirectoryEntriesState>(EMPTY_DIRECTORY);

  useEffect(() => {
    let cancelled = false;
    if (!directoryPath || !enabled) {
      queueMicrotask(() => {
        if (!cancelled) setState(EMPTY_DIRECTORY);
      });
      return () => {
        cancelled = true;
      };
    }

    void Promise.resolve()
      .then(() => {
        if (!cancelled) setState((current) => ({ ...current, loading: true, error: null }));
        return listDirectoryFromTauri(directoryPath);
      })
      .then((entries) => {
        if (!cancelled) setState({ entries, loading: false, error: null });
      })
      .catch((error: unknown) => {
        console.error('Failed to read folder:', error);
        if (!cancelled) {
          setState({ entries: [], loading: false, error: error instanceof Error ? error.message : String(error) });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [directoryPath, enabled, refreshToken]);

  return state;
}
