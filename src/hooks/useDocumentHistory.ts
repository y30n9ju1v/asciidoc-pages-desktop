import { useCallback, useEffect, useState } from 'react';
import { listDocumentSnapshots, readDocumentSnapshot } from '../services/documentHistoryAdapter';
import type { DocumentSnapshot } from '../services/documentHistoryService';

/** Keeps snapshot I/O out of dialogs and refreshes when the active document changes. */
export function useDocumentHistory(vaultRoot: string | null, documentPath: string | null) {
  const [snapshots, setSnapshots] = useState<DocumentSnapshot[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refreshSnapshots = useCallback(async () => {
    try {
      setError(null);
      setSnapshots(await listDocumentSnapshots(vaultRoot, documentPath));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  }, [documentPath, vaultRoot]);

  useEffect(() => {
    let active = true;
    void listDocumentSnapshots(vaultRoot, documentPath)
      .then((loaded) => {
        if (active) setSnapshots(loaded);
      })
      .catch((reason) => {
        if (active) setError(reason instanceof Error ? reason.message : String(reason));
      });
    return () => {
      active = false;
    };
  }, [documentPath, vaultRoot]);

  const restoreSnapshot = useCallback(
    async (snapshot: DocumentSnapshot): Promise<string> => readDocumentSnapshot(snapshot),
    [],
  );

  return { snapshots, error, refreshSnapshots, restoreSnapshot, readSnapshot: restoreSnapshot };
}
