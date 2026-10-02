import { describe, it, expect, vi, beforeEach } from 'vitest';

const { readFileMock } = vi.hoisted(() => ({ readFileMock: vi.fn() }));
vi.mock('@tauri-apps/plugin-fs', () => ({ readFile: readFileMock }));

const { bundleChapterImages } = await import('./epubImages');

describe('bundleChapterImages', () => {
  beforeEach(() => {
    readFileMock.mockReset();
  });

  const docPath = '/Users/foo/book/main.adoc';

  it('bundles a local image referenced with a relative path', async () => {
    readFileMock.mockResolvedValue(new Uint8Array([1, 2, 3]));

    const { chapters, assets } = await bundleChapterImages([{ bodyHtml: '<img src="images/cover.jpg">' }], docPath);

    expect(readFileMock).toHaveBeenCalledWith('/Users/foo/book/images/cover.jpg');
    expect(assets).toHaveLength(1);
    expect(chapters[0].bodyHtml).toContain(`images/${assets[0].filename}`);
  });

  // Regression test: epubImages.ts used to resolve <img src> paths with a naive
  // string concat (only stripped "/./", never validated "../" or absolute paths),
  // so an `image::../../../../etc/passwd[]` in the document text - already
  // blocked in the live preview by imageResolver.ts's resolveWithinRoot check -
  // would still get read off disk and bundled straight into the exported EPUB.
  it('refuses to bundle a path that escapes the document folder via ../ traversal', async () => {
    const { chapters, assets } = await bundleChapterImages(
      [{ bodyHtml: '<img src="../../../../etc/passwd">' }],
      docPath,
    );

    expect(readFileMock).not.toHaveBeenCalled();
    expect(assets).toHaveLength(0);
    expect(chapters[0].bodyHtml).toContain('../../../../etc/passwd');
  });

  it('refuses to bundle an absolute path outside the document folder', async () => {
    const { chapters, assets } = await bundleChapterImages([{ bodyHtml: '<img src="/etc/passwd">' }], docPath);

    expect(readFileMock).not.toHaveBeenCalled();
    expect(assets).toHaveLength(0);
    expect(chapters[0].bodyHtml).toContain('/etc/passwd');
  });

  it('skips resolution entirely when the document was never saved', async () => {
    const { assets } = await bundleChapterImages([{ bodyHtml: '<img src="images/cover.jpg">' }], null);

    expect(readFileMock).not.toHaveBeenCalled();
    expect(assets).toHaveLength(0);
  });

  it('leaves remote and data URIs untouched', async () => {
    const html = '<img src="https://example.com/a.png"><img src="data:image/png;base64,AAA=">';
    const { chapters, assets } = await bundleChapterImages([{ bodyHtml: html }], docPath);

    expect(readFileMock).not.toHaveBeenCalled();
    expect(assets).toHaveLength(0);
    expect(chapters[0].bodyHtml).toContain('https://example.com/a.png');
    expect(chapters[0].bodyHtml).toContain('data:image/png;base64,AAA=');
  });

  it('dedupes the same image referenced from multiple chapters', async () => {
    readFileMock.mockResolvedValue(new Uint8Array([1]));

    const { assets } = await bundleChapterImages(
      [{ bodyHtml: '<img src="images/cover.jpg">' }, { bodyHtml: '<img src="images/cover.jpg">' }],
      docPath,
    );

    expect(readFileMock).toHaveBeenCalledTimes(1);
    expect(assets).toHaveLength(1);
  });
});
