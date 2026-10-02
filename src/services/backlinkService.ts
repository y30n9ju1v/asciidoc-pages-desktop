import { VaultNote } from './vaultService';
import { extractWikilinks, resolveWikilinkTarget } from './wikilinkService';

export interface Backlink {
  path: string;
  title: string;
  /** A short snippet of surrounding text so the backlinks panel shows
   * *why* a note links here, not just that it does. */
  snippet: string;
}

const SNIPPET_RADIUS = 60;

function snippetAround(content: string, matchIndex: number, matchLength: number): string {
  const start = Math.max(0, matchIndex - SNIPPET_RADIUS);
  const end = Math.min(content.length, matchIndex + matchLength + SNIPPET_RADIUS);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < content.length ? '…' : '';
  return prefix + content.slice(start, end).replace(/\s+/g, ' ').trim() + suffix;
}

/**
 * Finds every other note in the vault that links to currentPath via a
 * [[wikilink]] - Obsidian's backlinks panel. Recomputed from scratch
 * (O(notes × links-per-note)) rather than maintaining a separate reverse-
 * link index that would need invalidating on every edit - fine at a
 * personal vault's scale, and much simpler.
 */
export function findBacklinks(currentPath: string, notes: VaultNote[]): Backlink[] {
  const backlinks: Backlink[] = [];

  for (const note of notes) {
    if (note.path === currentPath) continue;

    for (const link of extractWikilinks(note.content)) {
      const resolved = resolveWikilinkTarget(link.target, notes);
      if (resolved?.path !== currentPath) continue;

      const matchIndex = note.content.indexOf(link.raw);
      backlinks.push({
        path: note.path,
        title: note.title,
        snippet: matchIndex === -1 ? '' : snippetAround(note.content, matchIndex, link.raw.length),
      });
      break; // One row per source note, even if it links here more than once.
    }
  }

  return backlinks;
}
