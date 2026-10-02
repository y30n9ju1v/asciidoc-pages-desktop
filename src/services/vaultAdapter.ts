import { readDir, readTextFile, stat } from '@tauri-apps/plugin-fs';
import { indexVault, type VaultFileSystem, type VaultNote, type VaultCache } from './vaultService';

const tauriVaultFileSystem: VaultFileSystem = {
  readDirectory: readDir,
  readText: readTextFile,
  fingerprint: async (path) => {
    const info = await stat(path);
    return info.mtime ? `${info.mtime.getTime()}:${info.size}` : null;
  },
};

/** Tauri boundary for vault indexing; domain traversal stays in vaultService.ts. */
export function indexVaultFromTauri(rootDir: string, cache?: VaultCache): Promise<VaultNote[]> {
  return indexVault(tauriVaultFileSystem, rootDir, cache);
}
