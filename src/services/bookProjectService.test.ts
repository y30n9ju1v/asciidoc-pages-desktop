import { describe, expect, it } from 'vitest';
import {
  bibliographyOf,
  bookProjectPath,
  createBookProject,
  parseBookProject,
  serializeBookProject,
  withPublicationTypographyOverride,
} from './bookProjectService';

const documentMeta = {
  title: 'Book Title',
  author: 'Ada Writer',
  email: '',
  lang: 'ko',
  attributes: {},
};

describe('bookProjectService', () => {
  it('creates book metadata from the active manuscript', () => {
    expect(createBookProject(documentMeta)).toMatchObject({
      format: 'asciidoc-studio.book/v1',
      metadata: { title: 'Book Title', author: 'Ada Writer', language: 'ko' },
      chapters: [],
      targetWordCount: 0,
    });
  });

  it('stores project settings in a hidden vault directory', () => {
    expect(bookProjectPath('/Books/My Book')).toBe('/Books/My Book/.asciidoc-studio/book.json');
  });

  it('round-trips supported metadata and drops unknown fields', () => {
    const project = createBookProject(documentMeta);
    project.metadata.subjects = ['Technology', ' Documentation '];
    project.chapters = [{ path: '/vault/chapter.adoc', title: 'Chapter', status: 'review' }];
    project.publicationTypographyOverrides = {
      literary: {
        baseFontSizePt: 11,
        lineHeight: 1.9,
        letterSpacingEm: 0.01,
        wordSpacingEm: 0.02,
        paragraphSpacingEm: 0,
        firstLineIndentEm: 1.4,
        bodyJustification: true,
        chapterStartsOnNewPage: true,
      },
    };
    const parsed = parseBookProject(serializeBookProject(project));

    expect(parsed?.metadata.subjects).toEqual(['Technology', 'Documentation']);
    expect(parsed?.metadata.title).toBe('Book Title');
    expect(parsed?.chapters).toEqual(project.chapters);
    expect(parsed?.publicationTypographyOverrides).toEqual(project.publicationTypographyOverrides);
  });

  it('drops malformed typography overrides while preserving valid styles', () => {
    const project = createBookProject(documentMeta);
    const parsed = parseBookProject(
      JSON.stringify({
        ...project,
        publicationTypographyOverrides: {
          literary: {
            baseFontSizePt: 11,
            lineHeight: 1.8,
            letterSpacingEm: 0,
            wordSpacingEm: 0.01,
            paragraphSpacingEm: 0,
            firstLineIndentEm: 1.4,
            bodyJustification: true,
            chapterStartsOnNewPage: true,
          },
          'custom-unsafe': { baseFontSizePt: 999 },
          unknown: {
            baseFontSizePt: 11,
            lineHeight: 1.8,
            letterSpacingEm: 0,
            wordSpacingEm: 0,
            paragraphSpacingEm: 0,
            firstLineIndentEm: 1,
            bodyJustification: true,
            chapterStartsOnNewPage: true,
          },
        },
      }),
    );

    expect(parsed?.publicationTypographyOverrides).toEqual({
      literary: expect.objectContaining({ lineHeight: 1.8 }),
    });
  });

  it('adds and clears a reproducible typography override without changing unrelated project data', () => {
    const project = createBookProject(documentMeta);
    const typography = {
      baseFontSizePt: 11,
      lineHeight: 1.8,
      letterSpacingEm: 0,
      wordSpacingEm: 0.01,
      paragraphSpacingEm: 0,
      firstLineIndentEm: 1.4,
      bodyJustification: true,
      chapterStartsOnNewPage: true,
    };
    const updated = withPublicationTypographyOverride(project, 'literary', typography);

    expect(updated.metadata).toBe(project.metadata);
    expect(updated.publicationTypographyOverrides.literary).toEqual(typography);
    expect(withPublicationTypographyOverride(updated, 'literary', null).publicationTypographyOverrides).toEqual({});
  });

  it('rejects malformed and unsupported project files', () => {
    expect(parseBookProject('{')).toBeNull();
    expect(parseBookProject('{"format":"another-format","metadata":{}}')).toBeNull();
  });

  it('round-trips bibliography entries and drops a malformed or duplicate-keyed one', () => {
    const project = createBookProject(documentMeta);
    project.metadata.bibliography = [
      { key: 'smith2020', author: 'Jane Smith', title: 'A Great Book', year: '2020', publisher: '', url: '' },
    ];
    const parsed = parseBookProject(serializeBookProject(project));
    expect(parsed?.metadata.bibliography).toEqual(project.metadata.bibliography);

    const withBadEntries = JSON.stringify({
      ...JSON.parse(serializeBookProject(project)),
      metadata: {
        ...project.metadata,
        bibliography: [
          { key: 'smith2020', author: 'A', title: 'T', year: '', publisher: '', url: '' },
          { key: 'smith2020', author: 'Duplicate key, dropped', title: '', year: '', publisher: '', url: '' },
          { author: 'No key at all, dropped', title: '', year: '', publisher: '', url: '' },
        ],
      },
    });
    expect(parseBookProject(withBadEntries)?.metadata.bibliography).toEqual([
      { key: 'smith2020', author: 'A', title: 'T', year: '', publisher: '', url: '' },
    ]);
  });

  it('returns a stable empty collection when there is no open book project', () => {
    expect(bibliographyOf(null)).toBe(bibliographyOf(null));
  });
});
