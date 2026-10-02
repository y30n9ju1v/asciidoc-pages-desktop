import { VaultNote } from './vaultService';

// Obsidian-style #tag: a "#" followed by allowed characters (letters,
// digits, underscore, hyphen, and "/" for nested tags like
// #project/frontend). Deliberately doesn't special-case fenced code blocks
// or AsciiDoc's own #mark# passthrough syntax - same false-positive-
// tolerant tradeoff wikilinkService.ts's WIKILINK_RE and resolveIncludes/
// imageResolver already make for simplicity; a "#mark#" pair would
// misparse the opening "#word" as a tag, which is rare in practice and no
// worse than those existing tradeoffs.
const TAG_RE = /#([A-Za-z0-9][A-Za-z0-9_/-]*)/g;

/** Every #tag in content, including repeats, in the order they appear. */
export function extractTags(content: string): string[] {
  const tags: string[] = [];
  TAG_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = TAG_RE.exec(content)) !== null) {
    tags.push(match[1]);
  }
  return tags;
}

export interface TagCount {
  tag: string;
  /** Notes that use this tag at least once - not total occurrences, so a
   * tag repeated 3x in one note still counts as 1 here. */
  count: number;
}

/** Every distinct tag across the vault with its note count, sorted
 * alphabetically for a stable, scannable Tags panel. */
export function listAllTags(notes: VaultNote[]): TagCount[] {
  const noteCountByTag = new Map<string, number>();
  for (const note of notes) {
    for (const tag of new Set(extractTags(note.content))) {
      noteCountByTag.set(tag, (noteCountByTag.get(tag) ?? 0) + 1);
    }
  }
  return Array.from(noteCountByTag.entries())
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => a.tag.localeCompare(b.tag));
}

/**
 * Every note that uses `tag` - recomputed from scratch on every call rather
 * than maintaining a separate reverse index, the same "fine at a personal
 * vault's scale, much simpler" tradeoff backlinkService.ts's findBacklinks
 * already makes.
 */
export function findNotesByTag(tag: string, notes: VaultNote[]): VaultNote[] {
  return notes.filter((note) => extractTags(note.content).includes(tag));
}
