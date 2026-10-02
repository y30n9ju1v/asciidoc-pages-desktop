import { describe, it, expect, vi, beforeEach } from 'vitest';

const { readFileMock } = vi.hoisted(() => ({ readFileMock: vi.fn() }));
vi.mock('@tauri-apps/plugin-fs', () => ({ readFile: readFileMock }));

const { loadCoverImage, coverImageToDataUri } = await import('./coverImage');

describe('loadCoverImage', () => {
  beforeEach(() => {
    readFileMock.mockReset();
  });

  const currentPath = '/Users/foo/book/main.adoc';

  it('reads a cover image relative to the document folder', async () => {
    readFileMock.mockResolvedValue(new Uint8Array([1, 2, 3]));

    const cover = await loadCoverImage('images/cover.jpg', currentPath);

    expect(readFileMock).toHaveBeenCalledWith('/Users/foo/book/images/cover.jpg');
    expect(cover).toMatchObject({ filename: 'cover.jpg', mediaType: 'image/jpeg' });
  });

  it('returns null when the attribute is unset', async () => {
    expect(await loadCoverImage(undefined, currentPath)).toBeNull();
    expect(await loadCoverImage('', currentPath)).toBeNull();
    expect(readFileMock).not.toHaveBeenCalled();
  });

  it('returns null when the document was never saved', async () => {
    expect(await loadCoverImage('images/cover.jpg', null)).toBeNull();
    expect(readFileMock).not.toHaveBeenCalled();
  });

  it('refuses a cover path that escapes the document folder', async () => {
    expect(await loadCoverImage('../../../../etc/passwd', currentPath)).toBeNull();
    expect(readFileMock).not.toHaveBeenCalled();
  });

  it('returns null for an unsupported file extension', async () => {
    expect(await loadCoverImage('cover.pdf', currentPath)).toBeNull();
    expect(readFileMock).not.toHaveBeenCalled();
  });

  it('returns null when the file fails to read', async () => {
    readFileMock.mockRejectedValue(new Error('ENOENT'));
    expect(await loadCoverImage('images/missing.jpg', currentPath)).toBeNull();
  });
});

describe('coverImageToDataUri', () => {
  it('produces a valid data: URI for the image bytes', () => {
    const uri = coverImageToDataUri({ filename: 'cover.png', mediaType: 'image/png', data: new Uint8Array([1, 2, 3]) });
    expect(uri).toMatch(/^data:image\/png;base64,/);
  });
});
