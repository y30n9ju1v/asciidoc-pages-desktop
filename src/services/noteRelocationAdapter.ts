import { exists, mkdir, rename } from '@tauri-apps/plugin-fs';
import { indexVaultFromTauri } from './vaultAdapter';
import { writeDocumentText } from './documentFileAdapter';
import { loadBookProject, saveBookProject } from './bookProjectAdapter';
import { relocatedPath, planNoteRelocation } from './noteRelocationService';
import { isWithinRoot } from './pathSafety';
import type { VaultNote } from './vaultService';
import { documentHistoryDirectory } from './documentHistoryService';

interface HistoryMove {
  from: string;
  to: string;
}

async function historyMovesFor(
  notes: VaultNote[],
  root: string,
  oldPath: string,
  newPath: string,
): Promise<HistoryMove[]> {
  const moves: HistoryMove[] = [];
  for (const note of notes) {
    const moved = relocatedPath(note.path, oldPath, newPath);
    if (moved === note.path) continue;
    const from = documentHistoryDirectory(root, note.path);
    const to = documentHistoryDirectory(root, moved);
    if (!from || !to || !(await exists(from))) continue;
    if (await exists(to))
      throw new Error('The destination already has document history. Choose another name to preserve both histories.');
    moves.push({ from, to });
  }
  return moves;
}

async function rollbackMove(
  applied: { note: VaultNote; content: string }[],
  oldPath: string,
  newPath: string,
  backup: string,
): Promise<void> {
  for (const { note, content } of [...applied].reverse()) {
    await writeDocumentText(relocatedPath(note.path, oldPath, newPath), note.content, content);
  }
  if (await exists(oldPath))
    throw new Error(`Cannot roll back over a new file. Recover originals from ${backup}/recovery.json.`);
  await rename(newPath, oldPath);
}

function validateMove(root: string, oldPath: string, newPath: string): void {
  if (oldPath === root || !isWithinRoot(oldPath, root) || !isWithinRoot(newPath, root))
    throw new Error('Move must stay within the Vault.');
  if (isWithinRoot(newPath, oldPath)) throw new Error('Cannot move a folder into itself.');
}

/** Back up every affected source before moving or rewriting any user document. */
export async function relocateVaultEntry(root: string, oldPath: string, newPath: string): Promise<void> {
  if (oldPath === newPath) return;
  validateMove(root, oldPath, newPath);
  if (await exists(newPath)) throw new Error('The destination already exists.');
  const notes = await indexVaultFromTauri(root);
  const changes = planNoteRelocation(notes, root, oldPath, newPath);
  const book = await loadBookProject(root);
  const histories = await historyMovesFor(notes, root, oldPath, newPath);
  const backup = `${root}/.asciidoc-studio/relocations/${crypto.randomUUID()}`;
  await mkdir(backup, { recursive: true });
  await writeDocumentText(
    `${backup}/recovery.json`,
    JSON.stringify({ oldPath, newPath, book: book.source, changes, histories }, null, 2),
  );
  await rename(oldPath, newPath);
  const applied: typeof changes = [];
  const movedHistories: HistoryMove[] = [];
  try {
    for (const { note, content } of changes) {
      await writeDocumentText(relocatedPath(note.path, oldPath, newPath), content, note.content);
      applied.push({ note, content });
    }
    for (const history of histories) {
      await rename(history.from, history.to);
      movedHistories.push(history);
    }
    if (book.project) {
      const chapters = book.project.chapters.map((chapter) => ({
        ...chapter,
        path: relocatedPath(chapter.path, oldPath, newPath),
      }));
      await saveBookProject(root, { ...book.project, chapters }, book.source);
    }
  } catch (error) {
    try {
      for (const history of movedHistories.reverse()) await rename(history.to, history.from);
      await rollbackMove(applied, oldPath, newPath, backup);
    } catch (rollbackError) {
      throw new Error(
        `Move failed: ${String(error)}. Rollback incomplete: ${String(rollbackError)}. Recover originals from ${backup}/recovery.json.`,
        { cause: rollbackError },
      );
    }
    throw error;
  } finally {
    window.dispatchEvent(new Event('vault-files-changed'));
  }
}
