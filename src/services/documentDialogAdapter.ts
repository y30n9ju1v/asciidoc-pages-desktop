import { ask, message } from '@tauri-apps/plugin-dialog';

const UNSAVED_CHANGES_TITLE = 'Unsaved Changes';

/** Tauri dialog boundary for document lifecycle confirmations and failures. */
export function confirmDiscardChanges(promptMessage: string): Promise<boolean> {
  return ask(promptMessage, { title: UNSAVED_CHANGES_TITLE, kind: 'warning' });
}

export async function showDocumentError(title: string, error: unknown): Promise<void> {
  console.error(title, error);
  await message(`${title}: ${String(error)}`, { title, kind: 'error' });
}
