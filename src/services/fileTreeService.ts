import { IGNORED_DIR_ENTRY_NAMES, basenameOf, dirnameOf } from './pathSafety';

export interface FileTreeEntry {
  name: string;
  path: string;
  isDirectory: boolean;
}

export interface FileTreeDirectoryEntry {
  name: string;
  isDirectory: boolean;
}

/** Port for explorer mutations. The only Tauri implementation lives in fileTreeAdapter.ts. */
export interface FileTreeFileSystem {
  exists(path: string): Promise<boolean>;
  mkdir(path: string): Promise<void>;
  readDirectory(path: string): Promise<FileTreeDirectoryEntry[]>;
  remove(path: string, options: { recursive: boolean }): Promise<void>;
  rename(oldPath: string, newPath: string): Promise<void>;
  writeText(path: string, content: string): Promise<void>;
}

export async function listDirectory(fileSystem: FileTreeFileSystem, dirPath: string): Promise<FileTreeEntry[]> {
  const entries = await fileSystem.readDirectory(dirPath);
  return entries
    .filter((entry) => !IGNORED_DIR_ENTRY_NAMES.has(entry.name))
    .map((entry) => ({
      name: entry.name,
      path: `${dirPath}/${entry.name}`,
      isDirectory: entry.isDirectory,
    }))
    .sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
}

/**
 * Picks a filename that doesn't collide with any of existingNames: "New
 * Note.adoc" if free, otherwise "New Note 1.adoc", "New Note 2.adoc", ...
 * Pure and filesystem-independent so the "New Note"/"New Folder" context
 * menu actions (see FileExplorer.tsx) can create a file immediately, no
 * naming prompt needed up front - the new entry opens straight into
 * inline-rename instead, Obsidian's own convention.
 */
export function nextAvailableName(existingNames: string[], baseName: string): string {
  const existing = new Set(existingNames);
  if (!existing.has(baseName)) return baseName;

  const dotIndex = baseName.lastIndexOf('.');
  const stem = dotIndex === -1 ? baseName : baseName.slice(0, dotIndex);
  const ext = dotIndex === -1 ? '' : baseName.slice(dotIndex);

  for (let n = 1; ; n++) {
    const candidate = `${stem} ${n}${ext}`;
    if (!existing.has(candidate)) return candidate;
  }
}

/**
 * Carries a file's extension over to a rename that omitted one - e.g.
 * renaming "intro.adoc" to just "Introduction" (easy to do: nothing about
 * an inline rename box hints that the extension is part of what you're
 * editing) yields "Introduction.adoc", not a bare, unopenable-as-AsciiDoc
 * "Introduction". A no-op for directories (no extension concept) or when
 * newName already has one of its own.
 */
export function withPreservedExtension(newName: string, oldName: string, isDirectory: boolean): string {
  if (isDirectory || newName.includes('.')) return newName;
  const dotIndex = oldName.lastIndexOf('.');
  return dotIndex === -1 ? newName : newName + oldName.slice(dotIndex);
}

/** A tree-entry rename is a filename, never a path expression. */
export function isSafeEntryName(name: string): boolean {
  return (
    name !== '' && name !== '.' && name !== '..' && !name.includes('/') && !name.includes('\\') && !name.includes('\0')
  );
}

/** Creates a new, empty AsciiDoc note inside dirPath, auto-numbered against
 * siblingNames to avoid overwriting an existing file. Returns the new
 * file's full path. */
export async function createNote(
  fileSystem: FileTreeFileSystem,
  dirPath: string,
  siblingNames: string[],
): Promise<string> {
  const name = nextAvailableName(siblingNames, 'New Note.adoc');
  const path = `${dirPath}/${name}`;
  await fileSystem.writeText(path, `= ${name.replace(/\.adoc$/, '')}\n\n`);
  return path;
}

/** Creates a new subfolder inside dirPath, auto-numbered against
 * siblingNames. Returns the new folder's full path. */
export async function createFolder(
  fileSystem: FileTreeFileSystem,
  dirPath: string,
  siblingNames: string[],
): Promise<string> {
  const name = nextAvailableName(siblingNames, 'New Folder');
  const path = `${dirPath}/${name}`;
  await fileSystem.mkdir(path);
  return path;
}

/**
 * Renames path's own final segment to newName (keeping it in the same
 * parent folder - this is a rename, not a move to a different folder; see
 * movePath for that). Refuses if newName is blank/unchanged or something
 * already exists at the destination, so a mistyped rename can't silently
 * clobber a sibling.
 */
export async function renamePath(fileSystem: FileTreeFileSystem, path: string, newName: string): Promise<string> {
  const trimmed = newName.trim();
  if (!trimmed || trimmed === basenameOf(path)) return path;
  if (!isSafeEntryName(trimmed)) {
    throw new Error('A name cannot contain path separators or be . / ..');
  }

  const parentDir = dirnameOf(path);
  const newPath = parentDir ? `${parentDir}/${trimmed}` : trimmed;

  if (await fileSystem.exists(newPath)) {
    throw new Error(`"${trimmed}" already exists here.`);
  }
  await fileSystem.rename(path, newPath);
  return newPath;
}

/** Deletes a file or (recursively) a folder. */
export async function deletePath(fileSystem: FileTreeFileSystem, path: string, isDirectory: boolean): Promise<void> {
  await fileSystem.remove(path, { recursive: isDirectory });
}

/**
 * Moves path into targetDirPath, keeping its own name (drag-and-drop move -
 * see FileExplorer.tsx's onDrop). Refuses a no-op move (dropped on its own
 * current parent) and a destination collision the same way renamePath does.
 */
export async function movePath(fileSystem: FileTreeFileSystem, path: string, targetDirPath: string): Promise<string> {
  const name = basenameOf(path);
  const newPath = `${targetDirPath}/${name}`;
  if (newPath === path) return path;

  if (await fileSystem.exists(newPath)) {
    throw new Error(`"${name}" already exists in that folder.`);
  }
  await fileSystem.rename(path, newPath);
  return newPath;
}
