import { describe, it, expect, beforeEach } from 'vitest';
import { nextChapterStatus, loadChapterStatuses, storeChapterStatuses } from './chapterStatusService';

describe('nextChapterStatus', () => {
  it('starts at draft when unset', () => {
    expect(nextChapterStatus(undefined)).toBe('draft');
  });

  it('cycles draft -> review -> done -> draft', () => {
    expect(nextChapterStatus('draft')).toBe('review');
    expect(nextChapterStatus('review')).toBe('done');
    expect(nextChapterStatus('done')).toBe('draft');
  });
});

describe('loadChapterStatuses / storeChapterStatuses', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('round-trips a status map through localStorage, scoped by document path', () => {
    storeChapterStatuses('/Users/foo/book/main.adoc', { 'Chapter 1': 'done', 'Chapter 2': 'draft' });

    expect(loadChapterStatuses('/Users/foo/book/main.adoc')).toEqual({
      'Chapter 1': 'done',
      'Chapter 2': 'draft',
    });
    // A different document path must not see another document's statuses.
    expect(loadChapterStatuses('/Users/foo/other-book/main.adoc')).toEqual({});
  });

  it('returns an empty map and does not throw for an unsaved document (null path)', () => {
    expect(loadChapterStatuses(null)).toEqual({});
    expect(() => storeChapterStatuses(null, { X: 'draft' })).not.toThrow();
  });

  it('returns an empty map when nothing has been stored yet', () => {
    expect(loadChapterStatuses('/Users/foo/never-saved.adoc')).toEqual({});
  });
});
