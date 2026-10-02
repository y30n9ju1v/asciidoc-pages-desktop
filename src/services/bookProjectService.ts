import type { AsciidocDocMeta } from './asciidocService';
import type { ChapterStatus } from './chapterStatusService';
import type { BibliographyEntry } from './bibliographyService';
import type { VaultNote } from './vaultService';
import { PUBLICATION_TYPOGRAPHY_RANGES, type PublicationTypography } from './publicationTypographyService';
import type { PublicationStyleId } from './publicationStyleService';
import { PAGE_SIZE_LIST, type PageSizeId } from './pageSizeService';

export interface BookPublicationLayout {
  styleId: PublicationStyleId;
  pageSizeId: PageSizeId;
}
export const DEFAULT_BOOK_LAYOUT: BookPublicationLayout = { styleId: 'book-serif', pageSizeId: 'B5' };
export function parsePublicationLayout(value: unknown): BookPublicationLayout | undefined {
  if (!isRecord(value) || typeof value.styleId !== 'string' || !isPublicationStyleId(value.styleId)) return undefined;
  if (!PAGE_SIZE_LIST.some((size) => size.id === value.pageSizeId)) return undefined;
  return { styleId: value.styleId, pageSizeId: value.pageSizeId as PageSizeId };
}

export const BOOK_PROJECT_DIRECTORY = '.asciidoc-studio';
const BOOK_PROJECT_FILE = 'book.json';
const EMPTY_BIBLIOGRAPHY: BibliographyEntry[] = [];

export interface BookMetadata {
  title: string;
  subtitle: string;
  author: string;
  language: string;
  identifier: string;
  publisher: string;
  description: string;
  rights: string;
  subjects: string[];
  /** Every citable source `cite:[key]` markers in the manuscript may
   * resolve against - lives on BookMetadata (not a sibling BookProject
   * field next to `chapters`) purely for plumbing convenience: every export
   * path (exportToPdf/exportToTypst/exportToEpub, PublishDialog) already
   * threads a whole `BookMetadata` through, so this reaches all three
   * output formats with no new parameters anywhere in that chain. */
  bibliography: BibliographyEntry[];
}

export interface BookChapter {
  path: string;
  title: string;
  status: ChapterStatus;
}

export interface BookProject {
  publicationLayout?: BookPublicationLayout;
  format: 'asciidoc-studio.book/v1';
  metadata: BookMetadata;
  chapters: BookChapter[];
  targetWordCount: number;
  /**
   * Per-style proofing choices belong to the book, not to a machine-local UI
   * preference. This lets a PDF be reproduced after reopening the vault.
   */
  publicationTypographyOverrides: Partial<Record<PublicationStyleId, PublicationTypography>>;
}

export function bookProjectPath(vaultRoot: string): string {
  return `${vaultRoot}/${BOOK_PROJECT_DIRECTORY}/${BOOK_PROJECT_FILE}`;
}

/** The saved project's bibliography, or empty when no Book Project is open -
 * read directly off the saved project (not the merged/derived bookMetadata
 * App.tsx also computes) since that merge depends on the live preview's own
 * render result, which itself needs this value to render citations. */
export function bibliographyOf(project: BookProject | null): BibliographyEntry[] {
  // This value feeds usePreview's dependency list. A new `[]` for every
  // render continually cancels the debounced PDF-preview compilation before
  // it starts whenever no Book Project is open.
  return project?.metadata.bibliography ?? EMPTY_BIBLIOGRAPHY;
}

export function createBookMetadata(documentMeta: AsciidocDocMeta): BookMetadata {
  return {
    title: documentMeta.title || 'Untitled Book',
    subtitle: '',
    author: documentMeta.author || '',
    language: documentMeta.lang || 'en',
    identifier: '',
    publisher: '',
    description: '',
    rights: '',
    subjects: [],
    bibliography: [],
  };
}

export function createBookProject(documentMeta: AsciidocDocMeta): BookProject {
  return {
    format: 'asciidoc-studio.book/v1',
    metadata: createBookMetadata(documentMeta),
    chapters: [],
    targetWordCount: 0,
    publicationTypographyOverrides: {},
  };
}

/** Returns a new project with one style's reproducible PDF proofing choice updated. */
export function withPublicationTypographyOverride(
  project: BookProject,
  styleId: PublicationStyleId,
  typography: PublicationTypography | null,
): BookProject {
  const overrides = { ...project.publicationTypographyOverrides };
  if (typography) overrides[styleId] = typography;
  else delete overrides[styleId];
  return { ...project, publicationTypographyOverrides: overrides };
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function subjects(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((subject): subject is string => typeof subject === 'string')
    .map((subject) => subject.trim())
    .filter(Boolean);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function chapterStatus(value: unknown): ChapterStatus {
  return value === 'review' || value === 'done' ? value : 'draft';
}

function bibliography(value: unknown): BibliographyEntry[] {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  return value.flatMap((candidate) => {
    if (!isRecord(candidate)) return [];
    const key = text(candidate.key);
    if (!key || seen.has(key)) return [];
    seen.add(key);
    return [
      {
        key,
        author: text(candidate.author),
        title: text(candidate.title),
        year: text(candidate.year),
        publisher: text(candidate.publisher),
        url: text(candidate.url),
      },
    ];
  });
}

function chapters(value: unknown): BookChapter[] {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  return value.flatMap((candidate) => {
    if (!isRecord(candidate)) return [];
    const path = text(candidate.path);
    const title = text(candidate.title);
    if (!path || !title || seen.has(path)) return [];
    seen.add(path);
    return [{ path, title, status: chapterStatus(candidate.status) }];
  });
}

function targetWordCount(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : 0;
}

function isPublicationStyleId(value: string): value is PublicationStyleId {
  return (
    value === 'book-serif' || value === 'literary' || value === 'reference' || /^custom-[a-z0-9-]{1,80}$/.test(value)
  );
}

function isPublicationTypography(value: unknown): value is PublicationTypography {
  if (!isRecord(value)) return false;

  return (
    typeof value.bodyJustification === 'boolean' &&
    typeof value.chapterStartsOnNewPage === 'boolean' &&
    Object.entries(PUBLICATION_TYPOGRAPHY_RANGES).every(([field, range]) => {
      const candidate = value[field];
      return (
        typeof candidate === 'number' &&
        Number.isFinite(candidate) &&
        candidate >= range.minimum &&
        candidate <= range.maximum
      );
    })
  );
}

function publicationTypographyOverrides(value: unknown): BookProject['publicationTypographyOverrides'] {
  if (!isRecord(value)) return {};

  return Object.entries(value).reduce<BookProject['publicationTypographyOverrides']>(
    (overrides, [styleId, typography]) => {
      if (isPublicationStyleId(styleId) && isPublicationTypography(typography)) overrides[styleId] = typography;
      return overrides;
    },
    {},
  );
}

/** Parses only the stable, user-editable project fields and ignores unknown data. */
export function parseBookProject(value: string): BookProject | null {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!isRecord(parsed) || parsed.format !== 'asciidoc-studio.book/v1' || !isRecord(parsed.metadata)) return null;

    return {
      format: 'asciidoc-studio.book/v1',
      metadata: {
        title: text(parsed.metadata.title),
        subtitle: text(parsed.metadata.subtitle),
        author: text(parsed.metadata.author),
        language: text(parsed.metadata.language) || 'en',
        identifier: text(parsed.metadata.identifier),
        publisher: text(parsed.metadata.publisher),
        description: text(parsed.metadata.description),
        rights: text(parsed.metadata.rights),
        subjects: subjects(parsed.metadata.subjects),
        bibliography: bibliography(parsed.metadata.bibliography),
      },
      chapters: chapters(parsed.chapters),
      targetWordCount: targetWordCount(parsed.targetWordCount),
      publicationTypographyOverrides: publicationTypographyOverrides(parsed.publicationTypographyOverrides),
      ...(parsePublicationLayout(parsed.publicationLayout)
        ? { publicationLayout: parsePublicationLayout(parsed.publicationLayout) }
        : {}),
    };
  } catch {
    return null;
  }
}

export function serializeBookProject(project: BookProject): string {
  return `${JSON.stringify(project, null, 2)}\n`;
}

/** Uses explicit project values, falling back only for a newly created project. */
export function mergeBookMetadata(saved: BookMetadata | null, documentMeta: AsciidocDocMeta): BookMetadata {
  return saved ?? createBookMetadata(documentMeta);
}

/** The Vault notes behind the book's chapters, in chapter order; missing files are skipped. */
export function selectedBookNotes(chapters: BookChapter[], notes: VaultNote[]): VaultNote[] {
  const notesByPath = new Map(notes.map((note) => [note.path, note]));
  return chapters.flatMap((chapter) => {
    const note = notesByPath.get(chapter.path);
    return note ? [note] : [];
  });
}
