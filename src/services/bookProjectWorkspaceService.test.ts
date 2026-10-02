import { describe, expect, it } from 'vitest';
import {
  addBookChapter,
  calculateBookProgress,
  moveBookChapter,
  removeBookChapter,
} from './bookProjectWorkspaceService';

const first = { path: '/vault/one.adoc', title: 'One' };
const second = { path: '/vault/two.adoc', title: 'Two' };

describe('bookProjectWorkspaceService', () => {
  it('keeps chapter paths unique and supports deliberate ordering', () => {
    const chapters = addBookChapter(addBookChapter([], first), second);
    expect(addBookChapter(chapters, first)).toHaveLength(2);
    expect(moveBookChapter(chapters, second.path, -1).map((chapter) => chapter.title)).toEqual(['Two', 'One']);
  });

  it('reports status counts after a chapter is removed', () => {
    const chapters = addBookChapter([], first);
    expect(calculateBookProgress(removeBookChapter(chapters, first.path))).toEqual({ draft: 0, review: 0, done: 0 });
  });
});
