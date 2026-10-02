import { ask, message } from '@tauri-apps/plugin-dialog';

/** Tauri dialog boundary used by file-explorer user flows. */
export async function confirmDeletion(entryName: string): Promise<boolean> {
  return ask(`Move "${entryName}" to the .asciidoc-trash recovery folder? It can be restored there.`, {
    title: 'Delete',
    kind: 'warning',
  });
}

/** Presents filesystem failures instead of leaving them only in developer logs. */
export async function reportFileOperationError(title: string, error: unknown): Promise<void> {
  console.error(title, error);
  await message(error instanceof Error ? error.message : String(error), { title, kind: 'error' });
}
