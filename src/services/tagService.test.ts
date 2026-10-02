import { describe, expect, it } from 'vitest';
import { extractTags, findNotesByTag, listAllTags } from './tagService';
import type { VaultNote } from './vaultService';

function note(path: string, content: string): VaultNote {
  return { path, name: path, title: path, content };
}

describe('extractTags', () => {
  it('extracts plain and nested tags, including repeats, in appearance order', () => {
    expect(extractTags('Working on #project/frontend today. See #project/frontend and #draft.')).toEqual([
      'project/frontend',
      'project/frontend',
      'draft',
    ]);
  });

  it('returns nothing for content with no tag marker', () => {
    expect(extractTags('Just a plain paragraph, no hashtags here.')).toEqual([]);
  });
});

describe('listAllTags', () => {
  it('counts each tag by how many notes use it, not how many times it appears, sorted alphabetically', () => {
    const notes = [note('/a.adoc', '#draft #draft #book'), note('/b.adoc', '#book'), note('/c.adoc', 'no tags here')];

    expect(listAllTags(notes)).toEqual([
      { tag: 'book', count: 2 },
      { tag: 'draft', count: 1 },
    ]);
  });
});

describe('findNotesByTag', () => {
  it('returns only notes that use the given tag', () => {
    const notes = [note('/a.adoc', '#draft'), note('/b.adoc', '#book'), note('/c.adoc', '#draft #book')];
    expect(findNotesByTag('draft', notes).map((n) => n.path)).toEqual(['/a.adoc', '/c.adoc']);
  });
});
