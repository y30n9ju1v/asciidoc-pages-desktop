import { describe, expect, it } from 'vitest';
import { searchFallbackMatches, titleAndFilenameMatches } from './searchService';

describe('titleAndFilenameMatches', () => {
  it('matches a title or filename without case sensitivity', () => {
    expect(titleAndFilenameMatches({ title: 'Release Plan', name: 'plan-2026' }, 'PLAN')).toBe(true);
  });

  it('does not match unrelated notes', () => {
    expect(titleAndFilenameMatches({ title: 'Release Plan', name: 'plan-2026' }, 'meeting')).toBe(false);
  });
});

describe('searchFallbackMatches', () => {
  it('keeps quick-open usable while the native index is unavailable', () => {
    const result = searchFallbackMatches(
      [
        { path: '/vault/a.adoc', title: 'Architecture', name: 'architecture' },
        { path: '/vault/b.adoc', title: 'Meeting', name: 'meeting' },
      ],
      'arch',
    );
    expect(result).toEqual([{ path: '/vault/a.adoc', title: 'Architecture', name: 'architecture', snippet: '' }]);
  });
});
