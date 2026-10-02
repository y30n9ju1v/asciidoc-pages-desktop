import { describe, it, expect, vi, beforeEach } from 'vitest';

const { readFileMock, writeTextFileMock, chooseExportFileMock, messageMock, toastSuccessMock } = vi.hoisted(() => ({
  readFileMock: vi.fn(),
  writeTextFileMock: vi.fn(),
  chooseExportFileMock: vi.fn().mockResolvedValue('/Users/foo/book/Test Book.html'),
  messageMock: vi.fn(),
  toastSuccessMock: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-fs', () => ({ readFile: readFileMock, writeTextFile: writeTextFileMock }));
vi.mock('@tauri-apps/plugin-dialog', () => ({ message: messageMock }));
vi.mock('sonner', () => ({ toast: { success: toastSuccessMock } }));
vi.mock('./mermaidRenderer', () => ({ renderMermaidBlocks: vi.fn().mockResolvedValue(undefined) }));
vi.mock('./publicationDialogAdapter', () => ({ chooseExportFile: chooseExportFileMock }));

const { exportToHtml } = await import('./htmlExporter');

function baseRenderResult(attributes: Record<string, unknown>) {
  return {
    html: '<p>Body content</p>',
    meta: { title: 'Test Book', author: 'Author', email: '', lang: 'en', attributes },
  };
}

describe('exportToHtml', () => {
  beforeEach(() => {
    readFileMock.mockReset();
    readFileMock.mockResolvedValue(new Uint8Array([1, 2, 3]));
    writeTextFileMock.mockReset();
    chooseExportFileMock.mockReset();
    chooseExportFileMock.mockResolvedValue('/Users/foo/book/Test Book.html');
    messageMock.mockReset();
    toastSuccessMock.mockReset();
  });

  const currentPath = '/Users/foo/book/main.adoc';

  it('writes a standalone document with cover pages around the main content', async () => {
    await exportToHtml(
      baseRenderResult({ 'front-cover-image': 'images/cover.jpg', 'back-cover-image': 'images/back.jpg' }),
      currentPath,
    );

    expect(writeTextFileMock).toHaveBeenCalledTimes(1);
    const [destination, html] = writeTextFileMock.mock.calls[0] as [string, string];
    expect(destination).toBe('/Users/foo/book/Test Book.html');
    expect(toastSuccessMock).toHaveBeenCalledWith('HTML exported', { description: 'Test Book.html' });

    const frontIndex = html.indexOf('class="cover-page front-cover-page"');
    const bodyIndex = html.indexOf('Body content');
    const backIndex = html.indexOf('class="cover-page back-cover-page"');
    expect(frontIndex).toBeGreaterThan(-1);
    expect(frontIndex).toBeLessThan(bodyIndex);
    expect(bodyIndex).toBeLessThan(backIndex);
    expect(html).toContain('data:image/jpeg;base64,');
    expect(html).toContain("default-src 'none'");
    expect(html).toContain('img-src data:');
    expect(html).not.toContain('file:');
  });

  it('omits cover pages when no cover attributes are set', async () => {
    await exportToHtml(baseRenderResult({}), currentPath);

    const html = writeTextFileMock.mock.calls[0][1] as string;
    expect(html).not.toContain('class="cover-page');
  });

  it('refuses a cover path that escapes the document folder', async () => {
    await exportToHtml(baseRenderResult({ 'front-cover-image': '../../../../etc/passwd' }), currentPath);

    const html = writeTextFileMock.mock.calls[0][1] as string;
    expect(html).not.toContain('class="cover-page');
  });

  it('does not write when the save dialog is cancelled', async () => {
    chooseExportFileMock.mockResolvedValue(null);

    await exportToHtml(baseRenderResult({}), currentPath);

    expect(writeTextFileMock).not.toHaveBeenCalled();
  });
});
