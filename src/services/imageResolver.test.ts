import { describe, it, expect, vi, beforeEach } from 'vitest';

const { readFileMock, convertFileSrcMock } = vi.hoisted(() => ({
  readFileMock: vi.fn(),
  convertFileSrcMock: vi.fn(),
}));
vi.mock('@tauri-apps/plugin-fs', () => ({ readFile: readFileMock }));
vi.mock('@tauri-apps/api/core', () => ({ convertFileSrc: convertFileSrcMock }));

const { resolvePreviewImages } = await import('./imageResolver');

describe('resolvePreviewImages', () => {
  beforeEach(() => {
    readFileMock.mockReset();
    convertFileSrcMock.mockReset();
  });

  const currentPath = '/Users/foo/book/main.adoc';

  it('inlines a local image as a base64 data URI', async () => {
    readFileMock.mockResolvedValue(new Uint8Array([137, 80, 78, 71]));

    const out = await resolvePreviewImages('<img src="images/cover.png">', currentPath);

    expect(readFileMock).toHaveBeenCalledWith('/Users/foo/book/images/cover.png');
    expect(out).toContain('data:image/png;base64,');
  });

  it('falls back to convertFileSrc when the file cannot be read directly', async () => {
    readFileMock.mockRejectedValue(new Error('EACCES'));
    convertFileSrcMock.mockReturnValue('http://asset.localhost/Users/foo/book/images/cover.png');

    const out = await resolvePreviewImages('<img src="images/cover.png">', currentPath);

    expect(out).toContain('http://asset.localhost/Users/foo/book/images/cover.png');
  });

  it('leaves remote and data URIs untouched', async () => {
    const html = '<img src="https://example.com/a.png"><img src="data:image/png;base64,AAA=">';
    const out = await resolvePreviewImages(html, currentPath);

    expect(readFileMock).not.toHaveBeenCalled();
    expect(out).toBe(html);
  });

  it('leaves a local path untouched when the document was never saved', async () => {
    const html = '<img src="images/cover.png">';
    const out = await resolvePreviewImages(html, null);

    expect(readFileMock).not.toHaveBeenCalled();
    expect(out).toBe(html);
  });

  it('refuses to load an image that escapes the document folder', async () => {
    const html = '<img src="../../../../etc/passwd">';
    const out = await resolvePreviewImages(html, currentPath);

    expect(readFileMock).not.toHaveBeenCalled();
    expect(out).toBe(html);
  });

  it('preserves other attributes on the <img> tag', async () => {
    readFileMock.mockResolvedValue(new Uint8Array([1]));

    const out = await resolvePreviewImages('<img alt="Cover" src="images/cover.png" width="600">', currentPath);

    expect(out).toContain('alt="Cover"');
    expect(out).toContain('width="600"');
  });
});
