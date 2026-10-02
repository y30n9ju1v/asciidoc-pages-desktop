import { describe, it, expect } from 'vitest';
import { normalizePath, resolveWithinRoot, dirnameOf, basenameOf, isWithinRoot } from './pathSafety';

describe('normalizePath', () => {
  it('collapses . and .. segments', () => {
    expect(normalizePath('/a/b/../c')).toBe('/a/c');
    expect(normalizePath('/a/./b')).toBe('/a/b');
    expect(normalizePath('/a/b/c')).toBe('/a/b/c');
  });

  it('does not go negative past the root for absolute paths', () => {
    expect(normalizePath('/../../etc/passwd')).toBe('/etc/passwd');
  });

  it('keeps leading .. for relative paths (nothing to anchor against yet)', () => {
    expect(normalizePath('../a')).toBe('../a');
  });
});

describe('resolveWithinRoot', () => {
  const root = '/Users/foo/book';

  it('allows a sibling file in the same folder', () => {
    expect(resolveWithinRoot(root, '02-chapter.adoc', root)).toBe('/Users/foo/book/02-chapter.adoc');
  });

  it('allows a file in a subfolder', () => {
    expect(resolveWithinRoot(root, 'images/cover.jpg', root)).toBe('/Users/foo/book/images/cover.jpg');
  });

  it('allows going up and back down within the root', () => {
    expect(resolveWithinRoot(`${root}/chapters`, '../images/cover.jpg', root)).toBe('/Users/foo/book/images/cover.jpg');
  });

  it('blocks escaping the root via ../ traversal', () => {
    expect(resolveWithinRoot(root, '../../../../etc/passwd', root)).toBeNull();
  });

  it('blocks an absolute path outside the root', () => {
    expect(resolveWithinRoot(root, '/etc/passwd', root)).toBeNull();
  });

  it('allows an absolute path that happens to be inside the root', () => {
    expect(resolveWithinRoot(root, `${root}/images/cover.jpg`, root)).toBe('/Users/foo/book/images/cover.jpg');
  });
});

describe('isWithinRoot', () => {
  it('recognizes descendants without accepting sibling-prefix paths', () => {
    expect(isWithinRoot('/Books/book/main.adoc', '/Books/book')).toBe(true);
    expect(isWithinRoot('/Books/book-two/main.adoc', '/Books/book')).toBe(false);
  });

  it('handles the filesystem root', () => {
    expect(isWithinRoot('/anything', '/')).toBe(true);
  });
});

describe('dirnameOf', () => {
  it('returns the directory portion', () => {
    expect(dirnameOf('/Users/foo/book/main.adoc')).toBe('/Users/foo/book');
  });

  it('returns null when there is no slash', () => {
    expect(dirnameOf('main.adoc')).toBeNull();
  });
});

describe('basenameOf', () => {
  it('returns the final path segment', () => {
    expect(basenameOf('/Users/foo/book/main.adoc')).toBe('main.adoc');
  });

  it('returns the whole string when there is no slash', () => {
    expect(basenameOf('main.adoc')).toBe('main.adoc');
  });

  it('returns the folder name for a directory path', () => {
    expect(basenameOf('/Users/foo/book/chapters')).toBe('chapters');
  });
});
