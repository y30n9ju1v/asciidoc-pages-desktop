import { describe, it, expect, vi, beforeEach } from 'vitest';

const { readTextFileMock } = vi.hoisted(() => ({ readTextFileMock: vi.fn() }));
vi.mock('@tauri-apps/plugin-fs', () => ({ readTextFile: readTextFileMock }));

const { resolveIncludes } = await import('./includeResolver');

describe('resolveIncludes', () => {
  beforeEach(() => {
    readTextFileMock.mockReset();
  });

  const currentPath = '/Users/foo/book/main.adoc';

  it('returns content unchanged when there is no include:: directive', async () => {
    const content = '= Title\n\nJust text.';
    expect(await resolveIncludes(content, currentPath)).toBe(content);
  });

  it('inlines a sibling chapter file', async () => {
    readTextFileMock.mockResolvedValue('== Chapter 1\n\nBody text.');

    const out = await resolveIncludes('= Book\n\ninclude::chapter1.adoc[]', currentPath);

    expect(readTextFileMock).toHaveBeenCalledWith('/Users/foo/book/chapter1.adoc');
    expect(out).toContain('== Chapter 1');
    expect(out).not.toContain('include::chapter1.adoc[]');
  });

  it('blocks an include that escapes the document folder', async () => {
    const out = await resolveIncludes('include::../../../../etc/passwd[]', currentPath);

    expect(readTextFileMock).not.toHaveBeenCalled();
    expect(out).toContain('[Include Blocked: ../../../../etc/passwd]');
  });

  it('blocks an absolute path include', async () => {
    const out = await resolveIncludes('include::/etc/passwd[]', currentPath);

    expect(readTextFileMock).not.toHaveBeenCalled();
    expect(out).toContain('[Include Blocked: /etc/passwd]');
  });

  it('reports a missing include file without throwing', async () => {
    readTextFileMock.mockRejectedValue(new Error('ENOENT'));

    const out = await resolveIncludes('include::missing.adoc[]', currentPath);

    expect(out).toContain('[Include File Not Found: missing.adoc]');
  });

  it('detects a direct recursive include cycle', async () => {
    // chapter1.adoc includes itself
    readTextFileMock.mockResolvedValue('include::chapter1.adoc[]');

    const out = await resolveIncludes('include::chapter1.adoc[]', currentPath);

    expect(out).toContain('[Recursive Include Warning: chapter1.adoc]');
  });

  it('pins nested includes to the top-level document folder as root', async () => {
    // main.adoc includes chapters/ch1.adoc, which in turn includes ../secrets.adoc -
    // relative to chapters/, "../secrets.adoc" is still inside the book's root folder
    // (/Users/foo/book), so it should resolve, not be blocked.
    readTextFileMock.mockImplementation(async (path: string) => {
      if (path === '/Users/foo/book/chapters/ch1.adoc') return 'include::../secrets.adoc[]';
      if (path === '/Users/foo/book/secrets.adoc') return 'Top secret content.';
      throw new Error(`unexpected path ${path}`);
    });

    const out = await resolveIncludes('include::chapters/ch1.adoc[]', currentPath);

    expect(out).toContain('Top secret content.');
  });
});
