import type { BookChapter } from './bookProjectService';
import type { ChapterStatus } from './chapterStatusService';
import type { VaultNote } from './vaultService';

export interface BookProgress {
  draft: number;
  review: number;
  done: number;
}

function hasChapter(chapters: BookChapter[], path: string): boolean {
  return chapters.some((chapter) => chapter.path === path);
}

function createBookChapter(note: Pick<VaultNote, 'path' | 'title'>): BookChapter {
  return { path: note.path, title: note.title, status: 'draft' };
}

export function addBookChapter(chapters: BookChapter[], note: Pick<VaultNote, 'path' | 'title'>): BookChapter[] {
  return hasChapter(chapters, note.path) ? chapters : [...chapters, createBookChapter(note)];
}

export function removeBookChapter(chapters: BookChapter[], path: string): BookChapter[] {
  return chapters.filter((chapter) => chapter.path !== path);
}

export function moveBookChapter(chapters: BookChapter[], path: string, offset: -1 | 1): BookChapter[] {
  const index = chapters.findIndex((chapter) => chapter.path === path);
  const targetIndex = index + offset;
  if (index === -1 || targetIndex < 0 || targetIndex >= chapters.length) return chapters;

  const next = [...chapters];
  [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
  return next;
}

export function updateBookChapterStatus(chapters: BookChapter[], path: string, status: ChapterStatus): BookChapter[] {
  return chapters.map((chapter) => (chapter.path === path ? { ...chapter, status } : chapter));
}

export function calculateBookProgress(chapters: BookChapter[]): BookProgress {
  return chapters.reduce<BookProgress>(
    (progress, chapter) => ({ ...progress, [chapter.status]: progress[chapter.status] + 1 }),
    { draft: 0, review: 0, done: 0 },
  );
}

export function selectedBookNotes(chapters: BookChapter[], notes: VaultNote[]): VaultNote[] {
  const notesByPath = new Map(notes.map((note) => [note.path, note]));
  return chapters.flatMap((chapter) => {
    const note = notesByPath.get(chapter.path);
    return note ? [note] : [];
  });
}
