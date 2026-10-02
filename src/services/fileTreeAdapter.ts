import { exists, mkdir, readDir, remove, rename } from '@tauri-apps/plugin-fs';
import { toast } from 'sonner';
import { basenameOf, dirnameOf } from './pathSafety';
import { writeDocumentText } from './documentFileAdapter';
import {
  createFolder as createFolderIn,
  createNote as createNoteIn,
  listDirectory as listDirectoryIn,
  movePath as movePathIn,
  renamePath as renamePathIn,
  type FileTreeEntry,
  type FileTreeFileSystem,
} from './fileTreeService';

const tauriFileTreeFileSystem: FileTreeFileSystem = {
  exists,
  mkdir,
  readDirectory: readDir,
  remove,
  rename,
  writeText: writeDocumentText,
};

/** Tauri filesystem boundary for File Explorer user flows. */
export function listDirectoryFromTauri(path: string): Promise<FileTreeEntry[]> {
  return listDirectoryIn(tauriFileTreeFileSystem, path);
}

export function createNoteFromTauri(dirPath: string, siblingNames: string[]): Promise<string> {
  return createNoteIn(tauriFileTreeFileSystem, dirPath, siblingNames);
}

export function createFolderFromTauri(dirPath: string, siblingNames: string[]): Promise<string> {
  return createFolderIn(tauriFileTreeFileSystem, dirPath, siblingNames);
}

export function renamePathFromTauri(path: string, newName: string): Promise<string> {
  return renamePathIn(tauriFileTreeFileSystem, path, newName);
}

export async function deletePathFromTauri(path: string, _isDirectory: boolean): Promise<void> {
  const parent = dirnameOf(path);
  if (!parent) throw new Error('Cannot remove a filesystem root.');
  const trash = `${parent}/.asciidoc-trash`;
  await mkdir(trash, { recursive: true });
  const archived = `${trash}/${crypto.randomUUID()}-${basenameOf(path)}`;
  await rename(path, archived);
  toast.success('Moved to recovery folder', {
    description: `Recoverable from ${trash}`,
    duration: 15000,
    action: {
      label: 'Undo',
      onClick: () => {
        void restoreArchivedEntry(archived, path).catch((error) => toast.error(String(error)));
      },
    },
  });
}

async function restoreArchivedEntry(archived: string, path: string): Promise<void> {
  if (await exists(path))
    throw new Error('Another file now occupies this location. Recover the archived file manually.');
  await rename(archived, path);
  window.dispatchEvent(new Event('vault-files-changed'));
}

export function movePathFromTauri(path: string, targetDirPath: string): Promise<string> {
  return movePathIn(tauriFileTreeFileSystem, path, targetDirPath);
}
