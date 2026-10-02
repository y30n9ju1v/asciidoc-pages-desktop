import { describe, expect, it } from 'vitest';
import { isOpenDocumentDeleted, remapOpenDocumentPath } from './documentPathState';

describe('remapOpenDocumentPath', () => {
  it('updates an open file when its containing folder moves', () => {
    expect(remapOpenDocumentPath('/vault/chapters/intro.adoc', '/vault/chapters', '/vault/archive/chapters')).toBe(
      '/vault/archive/chapters/intro.adoc',
    );
  });

  it('does not mistake a similarly prefixed sibling for a descendant', () => {
    expect(remapOpenDocumentPath('/vault/chapters-2/intro.adoc', '/vault/chapters', '/vault/archive/chapters')).toBe(
      '/vault/chapters-2/intro.adoc',
    );
  });
});

describe('isOpenDocumentDeleted', () => {
  it('detects deletion of an open file or its containing folder', () => {
    expect(isOpenDocumentDeleted('/vault/chapters/intro.adoc', '/vault/chapters/intro.adoc')).toBe(true);
    expect(isOpenDocumentDeleted('/vault/chapters/intro.adoc', '/vault/chapters')).toBe(true);
    expect(isOpenDocumentDeleted('/vault/chapters/intro.adoc', '/vault/other')).toBe(false);
  });
});
