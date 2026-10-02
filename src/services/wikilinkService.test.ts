import { describe, it, expect } from 'vitest';
import {
  createWikilinkResolver,
  extractWikilinks,
  resolveWikilinkTarget,
  rewriteWikilinksForRender,
  wikilinkCandidates,
} from './wikilinkService';
import { VaultNote } from './vaultService';

function note(overrides: Partial<VaultNote>): VaultNote {
  return { path: '/vault/note.adoc', name: 'note', title: 'Note', content: '', ...overrides };
}

describe('extractWikilinks', () => {
  it('extracts a bare [[target]]', () => {
    expect(extractWikilinks('See [[Meeting Notes]] for details.')).toEqual([
      { raw: '[[Meeting Notes]]', target: 'Meeting Notes', alias: undefined },
    ]);
  });

  it('extracts [[target|alias]] with a display-text alias', () => {
    expect(extractWikilinks('See [[meeting-notes|our meeting]].')).toEqual([
      { raw: '[[meeting-notes|our meeting]]', target: 'meeting-notes', alias: 'our meeting' },
    ]);
  });

  it('extracts multiple wikilinks from the same content', () => {
    const links = extractWikilinks('[[A]] and [[B|Bee]] and [[C]]');
    expect(links.map((l) => l.target)).toEqual(['A', 'B', 'C']);
    expect(links[1].alias).toBe('Bee');
  });

  it('returns an empty array when there are none', () => {
    expect(extractWikilinks('Just plain text, no links here.')).toEqual([]);
  });

  it('skips a standalone [[id]] line, since that is an AsciiDoc block anchor', () => {
    expect(extractWikilinks('[[tbl-matrix]]\n|===\n|a\n|===\n')).toEqual([]);
  });

  it('finds a wikilink inside a nested list item despite its indentation', () => {
    expect(extractWikilinks('* Item\n  ** [[Nested Note]] sub item\n')).toEqual([
      { raw: '[[Nested Note]]', target: 'Nested Note', alias: undefined },
    ]);
  });
});

describe('resolveWikilinkTarget', () => {
  const notes = [
    note({ path: '/vault/meeting-notes.adoc', name: 'meeting-notes', title: 'Meeting Notes' }),
    note({ path: '/vault/todo.adoc', name: 'todo', title: 'To-Do List' }),
  ];

  it('resolves by exact title match', () => {
    expect(resolveWikilinkTarget('Meeting Notes', notes)?.path).toBe('/vault/meeting-notes.adoc');
  });

  it('resolves by filename when the target does not match any title', () => {
    expect(resolveWikilinkTarget('meeting-notes', notes)?.path).toBe('/vault/meeting-notes.adoc');
  });

  it('is case-insensitive and treats spaces/hyphens/underscores as equivalent', () => {
    expect(resolveWikilinkTarget('MEETING_notes', notes)?.path).toBe('/vault/meeting-notes.adoc');
  });

  it('returns null for a target with no matching note', () => {
    expect(resolveWikilinkTarget('Nonexistent Note', notes)).toBeNull();
  });

  it('indexes repeated lookups without changing title-first resolution', () => {
    const resolver = createWikilinkResolver([
      note({ path: '/vault/filename-match.adoc', name: 'target', title: 'Other' }),
      note({ path: '/vault/title-match.adoc', name: 'different', title: 'Target' }),
    ]);

    expect(resolver('target')?.path).toBe('/vault/title-match.adoc');
    expect(resolver('missing')).toBeNull();
  });

  it('refuses to guess between two notes that share the same title', () => {
    const duplicates = [
      note({ path: '/vault/a/dup.adoc', name: 'dup', title: 'Dup' }),
      note({ path: '/vault/b/dup.adoc', name: 'dup2', title: 'Dup' }),
    ];
    expect(resolveWikilinkTarget('Dup', duplicates)).toBeNull();
    expect(createWikilinkResolver(duplicates)('Dup')).toBeNull();
  });

  it('disambiguates same-titled notes with a folder-qualified target', () => {
    const duplicates = [
      note({ path: '/vault/a/dup.adoc', name: 'dup', title: 'Dup' }),
      note({ path: '/vault/b/dup.adoc', name: 'dup2', title: 'Dup' }),
    ];
    expect(wikilinkCandidates('a/dup', duplicates).map((n) => n.path)).toEqual(['/vault/a/dup.adoc']);
    expect(createWikilinkResolver(duplicates)('b/dup')?.path).toBe('/vault/b/dup.adoc');
  });
});

describe('rewriteWikilinksForRender', () => {
  const notes = [note({ path: '/vault/meeting-notes.adoc', name: 'meeting-notes', title: 'Meeting Notes' })];

  it('rewrites a resolved target into a link: macro with role="wikilink"', () => {
    const out = rewriteWikilinksForRender('See [[Meeting Notes]].', notes);
    expect(out).toBe('See link:wikilink:Meeting%20Notes[Meeting Notes,role="wikilink"].');
  });

  it('rewrites an unresolved target with the extra wikilink-new role', () => {
    const out = rewriteWikilinksForRender('See [[Brand New Note]].', notes);
    expect(out).toContain('role="wikilink wikilink-new"');
  });

  it('uses the alias as the link text when given', () => {
    const out = rewriteWikilinksForRender('[[meeting-notes|our sync]]', notes);
    expect(out).toBe('link:wikilink:meeting-notes[our sync,role="wikilink"]');
  });

  it('replaces a "," in the alias with a space so it cannot be parsed as an extra link: macro attribute', () => {
    const out = rewriteWikilinksForRender('[[meeting-notes|Weekly Sync, Team A]]', notes);
    expect(out).toBe('link:wikilink:meeting-notes[Weekly Sync  Team A,role="wikilink"]');
  });

  it('leaves content with no wikilinks untouched', () => {
    expect(rewriteWikilinksForRender('Nothing to see here.', notes)).toBe('Nothing to see here.');
  });

  it('leaves a standalone [[id]] line as a real AsciiDoc anchor', () => {
    const content = '[[tbl-matrix]]\n|===\n|a\n|===\n';
    expect(rewriteWikilinksForRender(content, notes)).toBe(content);
  });

  it('still rewrites a wikilink inside a nested list item', () => {
    const out = rewriteWikilinksForRender('* Item\n  ** [[Meeting Notes]] sub item\n', notes);
    expect(out).toContain('link:wikilink:Meeting%20Notes[Meeting Notes,role="wikilink"]');
  });
});
