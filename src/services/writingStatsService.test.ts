import { describe, expect, it } from 'vitest';
import { calculateWritingStats, countWords, progressPercent } from './writingStatsService';

describe('writingStatsService', () => {
  it('counts Latin and Korean words without treating punctuation as words', () => {
    expect(countWords("Hello, 세계! writer's note.")).toBe(4);
  });

  it('returns useful empty-document statistics', () => {
    expect(calculateWritingStats('')).toEqual({ words: 0, characters: 0, paragraphs: 0, readingMinutes: 0 });
  });

  it('caps target progress at one hundred percent', () => {
    expect(progressPercent(250, 200)).toBe(100);
  });

  it('counts a word-wrapped paragraph as one paragraph, not one per line', () => {
    const content = 'Line one of the\nsame paragraph, wrapped.\n\nA second paragraph.';
    expect(calculateWritingStats(content).paragraphs).toBe(2);
  });
});
