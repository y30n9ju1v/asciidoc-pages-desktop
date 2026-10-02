import { describe, expect, it } from 'vitest';
import { compareDocumentLines } from './documentDiffService';

describe('compareDocumentLines', () => {
  it('isolates the changed middle while retaining common context counts', () => {
    expect(compareDocumentLines('title\nold\nlast', 'title\nnew\nlast')).toEqual({
      unchangedBefore: 1,
      removed: ['old'],
      added: ['new'],
      unchangedAfter: 1,
    });
  });

  it('handles additions without a quadratic diff algorithm', () => {
    expect(compareDocumentLines('one', 'one\ntwo')).toEqual({
      unchangedBefore: 1,
      removed: [],
      added: ['two'],
      unchangedAfter: 0,
    });
  });
});
