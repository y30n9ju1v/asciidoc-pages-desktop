import { invoke } from '@tauri-apps/api/core';
import { VaultNote } from './vaultService';

export interface NoteSearchResult {
  path: string;
  name: string;
  title: string;
  snippet: string;
}

type NoteLabel = Pick<NoteSearchResult, 'title' | 'name'>;

/** The lightweight fallback used until an opened vault has finished indexing. */
export function titleAndFilenameMatches(note: NoteLabel, query: string): boolean {
  return `${note.title} ${note.name}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
}

export function searchFallbackMatches(notes: (NoteLabel & { path: string })[], query: string): NoteSearchResult[] {
  return notes
    .filter((note) => titleAndFilenameMatches(note, query))
    .slice(0, 12)
    .map((note) => ({ ...note, snippet: '' }));
}

/** Persists a disposable, incremental full-text index for one opened vault. */
export async function syncVaultSearchIndex(
  vaultRoot: string,
  notes: VaultNote[],
  previous?: Map<string, VaultNote>,
): Promise<void> {
  const changed = previous ? notes.filter((note) => previous.get(note.path) !== note) : notes;
  await invoke('sync_search_index', { vaultRoot, notes: changed, paths: notes.map((note) => note.path) });
  if (previous) {
    previous.clear();
    for (const note of notes) previous.set(note.path, note);
  }
}

/** Searches a vault's local SQLite FTS index. Query text is never interpolated into SQL. */
export async function searchVaultNotes(vaultRoot: string, query: string): Promise<NoteSearchResult[]> {
  return invoke<NoteSearchResult[]>('search_notes', { vaultRoot, query });
}
