import { describe, expect, it } from 'vitest';
import { relocateNoteReferences, relocatedPath, planNoteRelocation } from './noteRelocationService';
import type { VaultNote } from './vaultService';

function note(overrides: Partial<VaultNote>): VaultNote {
  return { path: '/vault/note.adoc', name: 'note', title: 'Note', content: '', ...overrides };
}

describe('relocatedPath', () => {
  it('maps an exact file match to the new path', () => {
    expect(relocatedPath('/vault/a.adoc', '/vault/a.adoc', '/vault/b.adoc')).toBe('/vault/b.adoc');
  });

  it('remaps every descendant when a folder moves', () => {
    expect(relocatedPath('/vault/chapters/one.adoc', '/vault/chapters', '/vault/book/chapters')).toBe(
      '/vault/book/chapters/one.adoc',
    );
  });

  it('leaves an unrelated path untouched', () => {
    expect(relocatedPath('/vault/other.adoc', '/vault/a.adoc', '/vault/b.adoc')).toBe('/vault/other.adoc');
  });

  it('does not treat a sibling with a shared prefix as a descendant', () => {
    // "/vault/chapters-archive" is not inside "/vault/chapters" even though
    // it shares a string prefix - isWithinRoot requires a "/" boundary.
    expect(relocatedPath('/vault/chapters-archive/x.adoc', '/vault/chapters', '/vault/book')).toBe(
      '/vault/chapters-archive/x.adoc',
    );
  });
});

describe('relocateNoteReferences', () => {
  const root = '/vault';

  it("rewrites a wikilink target to the moved note's new path, keeping the original text as the alias", () => {
    const moved = note({ path: '/vault/a.adoc', name: 'a', title: 'A' });
    const referencing = note({ path: '/vault/main.adoc', name: 'main', title: 'Main', content: 'See [[A]].' });
    const out = relocateNoteReferences(referencing, [moved, referencing], root, '/vault/a.adoc', '/vault/b.adoc');
    expect(out).toBe('See [[b.adoc|A]].');
  });

  it('keeps an existing alias instead of overwriting it with the resolved title', () => {
    const moved = note({ path: '/vault/a.adoc', name: 'a', title: 'A' });
    const referencing = note({
      path: '/vault/main.adoc',
      name: 'main',
      title: 'Main',
      content: 'See [[A|my alias]].',
    });
    const out = relocateNoteReferences(referencing, [moved, referencing], root, '/vault/a.adoc', '/vault/b.adoc');
    expect(out).toBe('See [[b.adoc|my alias]].');
  });

  it('leaves a wikilink alone when its target note is not the one being moved', () => {
    const other = note({ path: '/vault/other.adoc', name: 'other', title: 'Other' });
    const referencing = note({ path: '/vault/main.adoc', name: 'main', content: 'See [[Other]].' });
    const out = relocateNoteReferences(referencing, [other, referencing], root, '/vault/a.adoc', '/vault/b.adoc');
    expect(out).toBe('See [[Other]].');
  });

  it('rewrites an image:: path when the referencing note itself moves, even though the image does not', () => {
    const referencing = note({
      path: '/vault/notes/a.adoc',
      name: 'a',
      content: 'image::img.png[]',
    });
    const image = note({ path: '/vault/notes/img.png', name: 'img', content: '' });
    const out = relocateNoteReferences(
      referencing,
      [referencing, image],
      root,
      '/vault/notes/a.adoc',
      '/vault/deep/sub/a.adoc',
    );
    expect(out).toBe('image::../../notes/img.png[]');
  });

  it('rewrites an xref: path across folders when the target note moves', () => {
    const referencing = note({
      path: '/vault/notes/a.adoc',
      name: 'a',
      content: 'xref:../assets/diagram.adoc[See diagram]',
    });
    const out = relocateNoteReferences(
      referencing,
      [referencing],
      root,
      '/vault/assets/diagram.adoc',
      '/vault/media/diagram.adoc',
    );
    expect(out).toBe('xref:../media/diagram.adoc[See diagram]');
  });

  it('preserves a #fragment on an xref: target while rewriting the moved path', () => {
    const referencing = note({
      path: '/vault/notes/a.adoc',
      name: 'a',
      content: 'xref:../assets/diagram.adoc#callout-1[See diagram]',
    });
    const out = relocateNoteReferences(
      referencing,
      [referencing],
      root,
      '/vault/assets/diagram.adoc',
      '/vault/media/diagram.adoc',
    );
    expect(out).toBe('xref:../media/diagram.adoc#callout-1[See diagram]');
  });

  it('leaves a same-document #fragment xref untouched', () => {
    const referencing = note({ path: '/vault/notes/a.adoc', name: 'a', content: 'xref:#callout-1[See above]' });
    const out = relocateNoteReferences(referencing, [referencing], root, '/vault/notes/a.adoc', '/vault/b.adoc');
    expect(out).toBe('xref:#callout-1[See above]');
  });

  it('leaves an attribute-based dynamic path untouched (not safely rewritable)', () => {
    const referencing = note({
      path: '/vault/notes/a.adoc',
      name: 'a',
      content: 'image::{imagesdir}/pic.png[]',
    });
    const out = relocateNoteReferences(
      referencing,
      [referencing],
      root,
      '/vault/notes/pic.png',
      '/vault/media/pic.png',
    );
    expect(out).toBe('image::{imagesdir}/pic.png[]');
  });

  it('leaves a remote https:// link untouched', () => {
    const referencing = note({
      path: '/vault/notes/a.adoc',
      name: 'a',
      content: 'link:https://example.com/x.png[External]',
    });
    const out = relocateNoteReferences(referencing, [referencing], root, '/vault/notes/a.adoc', '/vault/moved/a.adoc');
    expect(out).toBe('link:https://example.com/x.png[External]');
  });

  it('does not rewrite a reference inside a source/listing block', () => {
    const referencing = note({
      path: '/vault/notes/a.adoc',
      name: 'a',
      content: '----\nimage::img.png[]\n----\n',
    });
    const image = note({ path: '/vault/notes/img.png', name: 'img', content: '' });
    const out = relocateNoteReferences(
      referencing,
      [referencing, image],
      root,
      '/vault/notes/a.adoc',
      '/vault/deep/a.adoc',
    );
    expect(out).toBe('----\nimage::img.png[]\n----\n');
  });

  it('rewrites a reference inside a nested list item despite its indentation', () => {
    const referencing = note({
      path: '/vault/notes/a.adoc',
      name: 'a',
      content: '* Item\n  ** image:img.png[]\n',
    });
    const image = note({ path: '/vault/notes/img.png', name: 'img', content: '' });
    const out = relocateNoteReferences(
      referencing,
      [referencing, image],
      root,
      '/vault/notes/a.adoc',
      '/vault/deep/a.adoc',
    );
    expect(out).toBe('* Item\n  ** image:../notes/img.png[]\n');
  });

  it('is a no-op when neither the note nor anything it references moved', () => {
    const referencing = note({
      path: '/vault/notes/a.adoc',
      name: 'a',
      content: 'See [[Other]]. image::img.png[]',
    });
    const other = note({ path: '/vault/notes/other.adoc', name: 'other', title: 'Other' });
    const out = relocateNoteReferences(
      referencing,
      [referencing, other],
      root,
      '/vault/unrelated.adoc',
      '/vault/also-unrelated.adoc',
    );
    expect(out).toBe('See [[Other]]. image::img.png[]');
  });
});

describe('relocation planning', () => {
  const note = (path: string, content: string, title = 'Note') => ({ path, content, title, name: 'note' });

  it('rebases outgoing assets and fragment links when the source moves, without changing literals', () => {
    const content = 'image::pic.png[]\nxref:other.adoc#section[Other]\n----\nimage::pic.png[]\n----';
    const notes = [note('/vault/old/note.adoc', content)];
    const changes = planNoteRelocation(notes, '/vault', '/vault/old/note.adoc', '/vault/new/note.adoc');
    expect(changes[0].content).toBe(
      'image::../old/pic.png[]\nxref:../old/other.adoc#section[Other]\n----\nimage::pic.png[]\n----',
    );
    expect(notes[0].content).toBe(content);
  });

  it('preserves ambiguous titles and updates only uniquely qualified references', () => {
    const notes = [
      note('/vault/a/note.adoc', '= Note'),
      note('/vault/b/note.adoc', '= Note'),
      note('/vault/main.adoc', 'See [[Note]] and [[a/note|First]].', 'Main'),
    ];
    const changes = planNoteRelocation(notes, '/vault', '/vault/a', '/vault/moved');
    expect(changes).toHaveLength(1);
    expect(changes[0].content).toBe('See [[Note]] and [[moved/note.adoc|First]].');
  });

  it('ignores unrelated notes, remote links and sibling paths sharing a prefix', () => {
    const notes = [note('/vault/main.adoc', 'include::ab/note.adoc[]\nlink:https://example.com[Site]')];
    expect(planNoteRelocation(notes, '/vault', '/vault/a', '/vault/moved')).toEqual([]);
  });
});
