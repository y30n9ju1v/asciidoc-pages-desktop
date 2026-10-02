import { message } from '@tauri-apps/plugin-dialog';
import { toast } from 'sonner';

/** Tauri dialog boundary for workspace-level outcomes. */
export async function notifyBookDetailsSaved(): Promise<void> {
  toast.success('Book details saved', { description: 'The book project was updated for this vault.' });
}

/** Explains why an unresolved wikilink cannot create a file without a vault. */
export async function notifyVaultRequiredForWikilink(): Promise<void> {
  await message('Open a folder first (via the file explorer) to create new linked notes.', {
    title: 'No Vault Open',
    kind: 'warning',
  });
}
