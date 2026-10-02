import { describe, it, expect } from 'vitest';
import { findBacklinks } from './backlinkService';
import { VaultNote } from './vaultService';

function note(overrides: Partial<VaultNote>): VaultNote {
  return { path: '/vault/note.adoc', name: 'note', title: 'Note', content: '', ...overrides };
}

describe('findBacklinks', () => {
  it('finds a note that links to the current note by title', () => {
    const notes = [
      note({ path: '/vault/target.adoc', name: 'target', title: 'Target Note' }),
      note({ path: '/vault/source.adoc', name: 'source', title: 'Source', content: 'See [[Target Note]] for more.' }),
    ];

    const backlinks = findBacklinks('/vault/target.adoc', notes);
    expect(backlinks).toHaveLength(1);
    expect(backlinks[0].path).toBe('/vault/source.adoc');
    expect(backlinks[0].title).toBe('Source');
    expect(backlinks[0].snippet).toContain('Target Note');
  });

  it('excludes the current note itself even if it links to itself', () => {
    const notes = [note({ path: '/vault/a.adoc', title: 'A', content: 'Self-link: [[A]]' })];
    expect(findBacklinks('/vault/a.adoc', notes)).toEqual([]);
  });

  it('excludes notes that link elsewhere', () => {
    const notes = [
      note({ path: '/vault/target.adoc', title: 'Target' }),
      note({ path: '/vault/other.adoc', title: 'Other', content: 'Links to [[Somewhere Else]].' }),
    ];
    expect(findBacklinks('/vault/target.adoc', notes)).toEqual([]);
  });

  it('lists one row per source note even if it links here multiple times', () => {
    const notes = [
      note({ path: '/vault/target.adoc', title: 'Target' }),
      note({ path: '/vault/source.adoc', title: 'Source', content: '[[Target]] ... again [[Target]]' }),
    ];
    expect(findBacklinks('/vault/target.adoc', notes)).toHaveLength(1);
  });

  it('returns an empty array when nothing links to the current note', () => {
    const notes = [note({ path: '/vault/lonely.adoc', title: 'Lonely' })];
    expect(findBacklinks('/vault/lonely.adoc', notes)).toEqual([]);
  });
});
