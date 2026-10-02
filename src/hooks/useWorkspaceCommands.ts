import { useCallback } from 'react';
import { VaultNote, sanitizeFileName } from '../services/vaultService';
import { resolveWikilinkTarget, wikilinkCandidates } from '../services/wikilinkService';
import { toast } from 'sonner';
import { notifyVaultRequiredForWikilink } from '../services/workspaceDialogService';

interface WorkspaceCommandsOptions {
  vaultRoot: string | null;
  notes: VaultNote[];
  saveDocument: () => Promise<void>;
  refreshVault: () => Promise<void>;
  openFile: (path: string) => Promise<void>;
  createAndOpenNote: (path: string, title: string) => Promise<void>;
}

function decodeWikilinkTarget(encodedTarget: string): string {
  try {
    return decodeURIComponent(encodedTarget);
  } catch {
    return encodedTarget;
  }
}

/** Coordinates user-facing document commands without making the app shell own their policy. */
export function useWorkspaceCommands({
  vaultRoot,
  notes,
  saveDocument,
  refreshVault,
  openFile,
  createAndOpenNote,
}: WorkspaceCommandsOptions) {
  const saveAndRefreshVault = useCallback(async () => {
    await saveDocument();
    await refreshVault();
  }, [refreshVault, saveDocument]);

  const openWikilink = useCallback(
    async (encodedTarget: string) => {
      const target = decodeWikilinkTarget(encodedTarget);
      const resolved = resolveWikilinkTarget(target, notes);
      if (wikilinkCandidates(target, notes).length > 1) {
        toast.error('Several notes match this link', {
          description: 'Use a folder-qualified target, such as [[research/note|Note]].',
        });
        return;
      }
      if (resolved) {
        await openFile(resolved.path);
        return;
      }

      if (!vaultRoot) {
        await notifyVaultRequiredForWikilink();
        return;
      }

      const fileName = sanitizeFileName(target) || 'Untitled';
      await createAndOpenNote(`${vaultRoot}/${fileName}.adoc`, target);
      await refreshVault();
    },
    [createAndOpenNote, notes, openFile, refreshVault, vaultRoot],
  );

  return { saveAndRefreshVault, openWikilink };
}
