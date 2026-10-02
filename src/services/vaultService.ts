import { IGNORED_DIR_ENTRY_NAMES } from './pathSafety';

export interface VaultNote {
  path: string;
  /** Filename without extension, e.g. "meeting-notes" for "meeting-notes.adoc". */
  name: string;
  /** The note's `= Title` document title if it has one, otherwise its name. */
  title: string;
  content: string;
}

const NOTE_EXTENSIONS = new Set(['adoc', 'asciidoc', 'txt']);
// Guards against a symlink loop or a genuinely pathological folder depth
// turning "open folder" into an unbounded recursive walk.
const MAX_DEPTH = 12;

export interface VaultDirectoryEntry {
  name: string;
  isDirectory: boolean;
}

/** The small filesystem port required to index a vault. Tauri lives in vaultAdapter.ts. */
export interface VaultFileSystem {
  readDirectory(path: string): Promise<VaultDirectoryEntry[]>;
  readText(path: string): Promise<string>;
  fingerprint?(path: string): Promise<string | null>;
}

export type VaultCache = Map<string, { fingerprint: string; note: VaultNote }>;

async function readIndexedNote(
  fileSystem: VaultFileSystem,
  path: string,
  name: string,
  cache: VaultCache,
): Promise<VaultNote> {
  const fingerprint = await fileSystem.fingerprint?.(path);
  const cached = cache.get(path);
  if (fingerprint && cached?.fingerprint === fingerprint) return cached.note;
  const content = await fileSystem.readText(path);
  const note = { path, name: stemOf(name), title: titleOf(content, name), content };
  if (fingerprint) cache.set(path, { fingerprint, note });
  return note;
}

function extensionOf(fileName: string): string {
  const idx = fileName.lastIndexOf('.');
  return idx === -1 ? '' : fileName.slice(idx + 1).toLowerCase();
}

function stemOf(fileName: string): string {
  const idx = fileName.lastIndexOf('.');
  return idx === -1 ? fileName : fileName.slice(0, idx);
}

/**
 * Pulls the title out of a note's content: its first `= Title` document
 * title line if it has one, otherwise its filename. Pure and independent of
 * the filesystem so it's directly unit-testable - wikilinkService.ts
 * matches `[[...]]` targets against this same value.
 */
export function titleOf(content: string, fileName: string): string {
  const match = content.match(/^=\s+(.+)$/m);
  return match ? match[1].trim() : stemOf(fileName);
}

/** Strips characters that aren't safe in a filename, for turning a wikilink
 * target/title into a new note's file name. */
export function sanitizeFileName(title: string): string {
  return title
    .trim()
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

async function walkDir(
  fileSystem: VaultFileSystem,
  dirPath: string,
  depth: number,
  notes: VaultNote[],
  cache: VaultCache,
): Promise<void> {
  if (depth > MAX_DEPTH) throw new Error('Vault nesting exceeds the supported 12 levels.');

  let entries;
  try {
    entries = await fileSystem.readDirectory(dirPath);
  } catch (err) {
    console.warn(`[vaultService] Failed to read folder: ${dirPath}`, err);
    throw err;
  }

  for (const entry of entries) {
    if (IGNORED_DIR_ENTRY_NAMES.has(entry.name)) continue;
    const entryPath = `${dirPath}/${entry.name}`;

    if (entry.isDirectory) {
      await walkDir(fileSystem, entryPath, depth + 1, notes, cache);
      continue;
    }
    if (!NOTE_EXTENSIONS.has(extensionOf(entry.name))) continue;

    try {
      notes.push(await readIndexedNote(fileSystem, entryPath, entry.name, cache));
    } catch (err) {
      console.warn(`[vaultService] Failed to read note: ${entryPath}`, err);
      throw err;
    }
  }
}

/**
 * Recursively indexes every AsciiDoc note under rootDir - the "vault" that
 * wikilink resolution (wikilinkService.ts) and the backlinks panel
 * (backlinkService.ts) search across.
 *
 * Reads every note's full content up front, unlike fileTreeService's
 * per-folder lazy expansion (used by the plain file-browser tree): both
 * wikilink resolution and backlinks need every note's text to find
 * `[[...]]` references in it anyway, and a personal notes vault is small
 * enough (tens/hundreds of files, not millions) that doing this eagerly on
 * open/refresh is simpler than building a lazy, incrementally-updated index.
 */
export async function indexVault(
  fileSystem: VaultFileSystem,
  rootDir: string,
  cache: VaultCache = new Map(),
): Promise<VaultNote[]> {
  const notes: VaultNote[] = [];
  await walkDir(fileSystem, rootDir, 0, notes, cache);
  const paths = new Set(notes.map((note) => note.path));
  for (const path of cache.keys()) if (!paths.has(path)) cache.delete(path);
  return notes;
}
