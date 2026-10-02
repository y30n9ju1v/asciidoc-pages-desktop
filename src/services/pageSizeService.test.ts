import { describe, it, expect, beforeEach } from 'vitest';
import { getPageSize, loadStoredPageSizeId, storePageSizeId, DEFAULT_PAGE_SIZE_ID } from './pageSizeService';

describe('getPageSize', () => {
  it('returns the requested page size', () => {
    expect(getPageSize('A4').id).toBe('A4');
  });

  it('falls back to B5 for an unknown id', () => {
    expect(getPageSize('not-a-real-size' as any).id).toBe('B5');
  });
});

describe('page size persistence', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('round-trips a valid page size id', () => {
    storePageSizeId('Letter');
    expect(loadStoredPageSizeId()).toBe('Letter');
  });

  it('falls back to the default when nothing is stored', () => {
    expect(loadStoredPageSizeId()).toBe(DEFAULT_PAGE_SIZE_ID);
  });

  it('falls back to the default when the stored value is not a real page size', () => {
    localStorage.setItem('asciidoc-studio:page-size', 'Tabloid');
    expect(loadStoredPageSizeId()).toBe(DEFAULT_PAGE_SIZE_ID);
  });
});
