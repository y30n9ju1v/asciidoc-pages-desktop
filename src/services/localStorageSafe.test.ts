import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { safeGetItem, safeSetItem } from './localStorageSafe';

describe('safeGetItem / safeSetItem', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('round-trips a value through localStorage', () => {
    safeSetItem('k', 'v');
    expect(safeGetItem('k')).toBe('v');
  });

  it('returns null for a key that was never set', () => {
    expect(safeGetItem('missing')).toBeNull();
  });

  describe('when localStorage throws', () => {
    let getItemSpy: ReturnType<typeof vi.spyOn>;
    let setItemSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      getItemSpy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('disabled');
      });
      setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('disabled');
      });
    });

    afterEach(() => {
      getItemSpy.mockRestore();
      setItemSpy.mockRestore();
    });

    it('safeGetItem returns null instead of throwing', () => {
      expect(() => safeGetItem('k')).not.toThrow();
      expect(safeGetItem('k')).toBeNull();
    });

    it('safeSetItem swallows the error instead of throwing', () => {
      expect(() => safeSetItem('k', 'v')).not.toThrow();
    });
  });
});
