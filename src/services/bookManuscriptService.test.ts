import { describe, expect, it } from 'vitest';
import { buildBookManuscript } from './bookManuscriptService';
import type { BookProject, BookChapter } from './bookProjectService';
import type { VaultNote } from './vaultService';

function chapter(overrides: Partial<BookChapter>): BookChapter {
  return { path: '/vault/chapter.adoc', title: 'Chapter', status: 'draft', ...overrides };
}

function note(overrides: Partial<VaultNote>): VaultNote {
  return { path: '/vault/chapter.adoc', name: 'chapter', title: 'Chapter', content: '', ...overrides };
}

function project(chapters: BookChapter[]): BookProject {
  return {
    format: 'asciidoc-studio.book/v1',
    metadata: {
      title: 'My Book',
      subtitle: '',
      author: 'An Author',
      language: 'en',
      identifier: '',
      publisher: '',
      description: '',
      rights: '',
      subjects: [],
      bibliography: [],
    },
    chapters,
    targetWordCount: 0,
    publicationTypographyOverrides: {},
  };
}

describe('buildBookManuscript', () => {
  it('rejects an empty book', () => {
    expect(() => buildBookManuscript(project([]), [], '/vault')).toThrow('Add chapters');
  });

  it('fails clearly when a listed chapter is missing from the vault index', () => {
    expect(() => buildBookManuscript(project([chapter({ path: '/vault/missing.adoc' })]), [], '/vault')).toThrow(
      'Missing chapter',
    );
  });

  it('rejects a chapter path outside the Vault', () => {
    const outside = note({ path: '/outside/chapter.adoc', content: 'Body.' });
    expect(() =>
      buildBookManuscript(project([chapter({ path: '/outside/chapter.adoc' })]), [outside], '/vault'),
    ).toThrow('outside Vault');
  });

  it('writes the book-level title/author/language header and strips a chapter attribute preamble, demoting its own title to a section', () => {
    const chapterNote = note({
      content: '= Chapter One\n:author: Someone Else\n\nFirst paragraph.\n\n== A Section\n\nMore text.\n',
    });
    const out = buildBookManuscript(project([chapter({ path: chapterNote.path })]), [chapterNote], '/vault');

    expect(out.startsWith('= My Book\n:author: An Author\n:lang: en\n:doctype: book\n:toc:\n\n')).toBe(true);
    // The chapter's own attribute line is gone; its title demoted one level,
    // and its nested section demoted along with it.
    expect(out).toContain('== Chapter One\n\nFirst paragraph.');
    expect(out).toContain('=== A Section\n\nMore text.');
    expect(out).not.toContain(':author: Someone Else');
  });

  it('joins multiple chapters in the project order given', () => {
    const first = note({ path: '/vault/a.adoc', content: '= A\n\nBody A.\n' });
    const second = note({ path: '/vault/b.adoc', content: '= B\n\nBody B.\n' });
    const out = buildBookManuscript(
      project([chapter({ path: '/vault/a.adoc' }), chapter({ path: '/vault/b.adoc' })]),
      [first, second],
      '/vault',
    );

    expect(out.indexOf('== A')).toBeLessThan(out.indexOf('== B'));
  });

  it('rewrites an image path to be relative to the Vault root instead of the chapter folder', () => {
    const chapterNote = note({
      path: '/vault/chapters/one.adoc',
      content: '= One\n\nimage::diagrams/pic.png[]\n',
    });
    const out = buildBookManuscript(project([chapter({ path: chapterNote.path })]), [chapterNote], '/vault');

    expect(out).toContain('image::chapters/diagrams/pic.png[');
  });

  it('leaves a remote scheme-prefixed reference untouched', () => {
    const chapterNote = note({ content: '= One\n\nimage::https://example.com/pic.png[]\n' });
    const out = buildBookManuscript(project([chapter({ path: chapterNote.path })]), [chapterNote], '/vault');

    expect(out).toContain('image::https://example.com/pic.png[');
  });

  it('throws a clear error instead of silently shipping an attribute-based dynamic path', () => {
    const chapterNote = note({ title: 'One', content: '= One\n\nimage::{imagesdir}/pic.png[]\n' });
    expect(() => buildBookManuscript(project([chapter({ path: chapterNote.path })]), [chapterNote], '/vault')).toThrow(
      /Expand path attributes in chapter One/,
    );
  });

  it('rejects an asset reference that resolves outside the Vault', () => {
    const chapterNote = note({ content: '= One\n\nimage::../../outside.png[]\n' });
    expect(() => buildBookManuscript(project([chapter({ path: chapterNote.path })]), [chapterNote], '/vault')).toThrow(
      'outside Vault',
    );
  });

  it('strips newlines from book metadata so they cannot inject a new attribute line', () => {
    const chapterNote = note({ content: '= One\n\nBody.\n' });
    const malicious = project([chapter({ path: chapterNote.path })]);
    malicious.metadata.title = 'Title\n:revdate: injected';
    const out = buildBookManuscript(malicious, [chapterNote], '/vault');

    expect(out.split('\n')[0]).toBe('= Title :revdate: injected');
  });
});
