import { invoke } from '@tauri-apps/api/core';

/** Opens a recursively scoped vault folder selected explicitly by the user. */
export function chooseVaultFolderPath(): Promise<string | null> {
  return invoke('choose_vault_folder');
}
