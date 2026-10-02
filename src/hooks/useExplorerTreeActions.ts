import { useCallback } from 'react';
import {
  createFolderFromTauri,
  createNoteFromTauri,
  deletePathFromTauri,
  movePathFromTauri,
  renamePathFromTauri,
} from '../services/fileTreeAdapter';
import type { FileTreeEntry } from '../services/fileTreeService';
import { confirmDeletion, reportFileOperationError } from '../services/fileExplorerDialogService';
import { relocateVaultEntry } from '../services/noteRelocationAdapter';
import { dirnameOf, basenameOf } from '../services/pathSafety';
import { isSafeEntryName } from '../services/fileTreeService';

type EntryKind = 'note' | 'folder';

interface ExplorerTreeActionOptions {
  beforeMutation?: () => void;
  vaultRoot?: string | null;
  bumpRefresh: () => void;
  setJustCreatedPath: (path: string | null) => void;
  onEntryRenamed?: (oldPath: string, newPath: string) => void;
  onEntryDeleted?: (path: string) => void;
  onVaultMutated?: () => void;
}

export interface ExplorerTreeActions {
  createEntry: (directoryPath: string, siblings: FileTreeEntry[], kind: EntryKind) => Promise<string | null>;
  renameEntry: (path: string, newName: string) => Promise<string | null>;
  deleteEntry: (entry: FileTreeEntry) => Promise<boolean>;
  moveEntry: (sourcePath: string, targetDirectoryPath: string) => Promise<string | null>;
}

/** Coordinates filesystem mutations, UI feedback, and vault refresh notifications. */
export function useExplorerTreeActions({
  beforeMutation,
  vaultRoot,
  bumpRefresh,
  setJustCreatedPath,
  onEntryRenamed,
  onEntryDeleted,
  onVaultMutated,
}: ExplorerTreeActionOptions): ExplorerTreeActions {
  const notifyMutation = useCallback(() => {
    bumpRefresh();
    onVaultMutated?.();
  }, [bumpRefresh, onVaultMutated]);

  const createEntry = useCallback(
    async (directoryPath: string, siblings: FileTreeEntry[], kind: EntryKind): Promise<string | null> => {
      try {
        const names = siblings.map((entry) => entry.name);
        const path =
          kind === 'note'
            ? await createNoteFromTauri(directoryPath, names)
            : await createFolderFromTauri(directoryPath, names);
        setJustCreatedPath(path);
        notifyMutation();
        return path;
      } catch (error) {
        await reportFileOperationError(`Failed to create ${kind}`, error);
        return null;
      }
    },
    [notifyMutation, setJustCreatedPath],
  );

  const renameEntry = useCallback(
    async (path: string, newName: string): Promise<string | null> => {
      try {
        beforeMutation?.();
        if (!isSafeEntryName(newName.trim())) throw new Error('Invalid file name.');
        const newPath = vaultRoot ? `${dirnameOf(path)}/${newName.trim()}` : await renamePathFromTauri(path, newName);
        if (vaultRoot) await relocateVaultEntry(vaultRoot, path, newPath);
        if (newPath === path) return newPath;
        onEntryRenamed?.(path, newPath);
        notifyMutation();
        return newPath;
      } catch (error) {
        await reportFileOperationError('Rename failed', error);
        return null;
      }
    },
    [notifyMutation, onEntryRenamed, vaultRoot, beforeMutation],
  );

  const deleteEntry = useCallback(
    async (entry: FileTreeEntry): Promise<boolean> => {
      if (!(await confirmDeletion(entry.name))) return false;
      try {
        beforeMutation?.();
        await deletePathFromTauri(entry.path, entry.isDirectory);
        onEntryDeleted?.(entry.path);
        notifyMutation();
        return true;
      } catch (error) {
        await reportFileOperationError('Delete failed', error);
        return false;
      }
    },
    [notifyMutation, onEntryDeleted, beforeMutation],
  );

  const moveEntry = useCallback(
    async (sourcePath: string, targetDirectoryPath: string): Promise<string | null> => {
      try {
        beforeMutation?.();
        const newPath = vaultRoot
          ? `${targetDirectoryPath}/${basenameOf(sourcePath)}`
          : await movePathFromTauri(sourcePath, targetDirectoryPath);
        if (vaultRoot) await relocateVaultEntry(vaultRoot, sourcePath, newPath);
        if (newPath === sourcePath) return newPath;
        onEntryRenamed?.(sourcePath, newPath);
        notifyMutation();
        return newPath;
      } catch (error) {
        await reportFileOperationError('Failed to move', error);
        return null;
      }
    },
    [notifyMutation, onEntryRenamed, vaultRoot, beforeMutation],
  );

  return { createEntry, renameEntry, deleteEntry, moveEntry };
}
