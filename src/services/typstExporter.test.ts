import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SafeDocument } from './safeDocument';

const {
  chooseExportDirectoryMock,
  messageMock,
  toastSuccessMock,
  writeTextFileMock,
  mkdirMock,
  copyFileMock,
  writeFileMock,
  invokeMock,
  appCacheDirMock,
  renderMermaidToSvgStringMock,
} = vi.hoisted(() => ({
  chooseExportDirectoryMock: vi.fn(),
  messageMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  writeTextFileMock: vi.fn(),
  mkdirMock: vi.fn(),
  copyFileMock: vi.fn(),
  writeFileMock: vi.fn(),
  invokeMock: vi.fn(),
  appCacheDirMock: vi.fn(),
  renderMermaidToSvgStringMock: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-fs', () => ({
  writeTextFile: writeTextFileMock,
  mkdir: mkdirMock,
  copyFile: copyFileMock,
  writeFile: writeFileMock,
}));
vi.mock('@tauri-apps/plugin-dialog', () => ({ message: messageMock }));
vi.mock('sonner', () => ({ toast: { success: toastSuccessMock } }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: invokeMock }));
vi.mock('@tauri-apps/api/path', () => ({ appCacheDir: appCacheDirMock }));
vi.mock('./mermaidRenderer', () => ({ renderMermaidToSvgString: renderMermaidToSvgStringMock }));
vi.mock('./publicationDialogAdapter', () => ({ chooseExportDirectory: chooseExportDirectoryMock }));

const { exportToTypst } = await import('./typstExporter');

function documentWith(blocks: SafeDocument['blocks'], metadata?: Partial<SafeDocument['metadata']>): SafeDocument {
  return {
    version: 1,
    metadata: { title: 'Doc Title', author: 'Doc Author', language: 'en', ...metadata },
    diagnostics: [],
    blocks,
  };
}

const docMeta = { title: 'Meta Title', author: 'Meta Author', email: '', lang: 'ko', attributes: {} };
const docPath = '/Users/foo/book/main.adoc';

describe('exportToTypst', () => {
  beforeEach(() => {
    chooseExportDirectoryMock.mockReset();
    messageMock.mockReset();
    toastSuccessMock.mockReset();
    writeTextFileMock.mockReset();
    mkdirMock.mockReset();
    copyFileMock.mockReset();
    writeFileMock.mockReset();
    invokeMock.mockReset();
    appCacheDirMock.mockReset();
    renderMermaidToSvgStringMock.mockReset();
    chooseExportDirectoryMock.mockResolvedValue('/Users/foo/export');
    writeTextFileMock.mockResolvedValue(undefined);
    mkdirMock.mockResolvedValue(undefined);
    copyFileMock.mockResolvedValue(undefined);
    writeFileMock.mockResolvedValue(undefined);
    appCacheDirMock.mockResolvedValue('/Users/foo/.cache/asciidoc-studio');
    invokeMock.mockResolvedValue('#set document(title: "Doc Title", author: "Doc Author", date: auto)\n');
  });

  const paragraph = {
    type: 'paragraph' as const,
    text: 'x',
    inlines: [{ type: 'text' as const, value: 'x' }],
    location: { line: 1 },
  };

  it('asks for a destination folder, generates the source, and writes main.typ into it', async () => {
    const result = await exportToTypst(documentWith([paragraph]), docMeta, docPath, 'manuscript', 'B5', 'book-serif');
    expect(result).toBe(true);

    expect(chooseExportDirectoryMock).toHaveBeenCalledOnce();
    expect(invokeMock).toHaveBeenCalledWith('generate_typst_source', { requestJson: expect.any(String) });
    const sentRequest = JSON.parse(invokeMock.mock.calls[0][1].requestJson);
    expect(sentRequest).toMatchObject({
      template: { id: 'manuscript' },
      pageSize: { id: 'B5' },
      assets: [],
      documentRoot: '/Users/foo/book',
    });

    expect(writeTextFileMock).toHaveBeenCalledWith(
      '/Users/foo/export/main.typ',
      '#set document(title: "Doc Title", author: "Doc Author", date: auto)\n',
    );
    expect(toastSuccessMock).toHaveBeenCalledWith('Typst project exported', { description: 'export' });
  });

  it('does not invoke the generator when the folder dialog is cancelled', async () => {
    chooseExportDirectoryMock.mockResolvedValue(null);
    const result = await exportToTypst(documentWith([paragraph]), docMeta, docPath, 'manuscript', 'B5', 'book-serif');
    expect(result).toBe(false);
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it('copies a document-relative image asset to the same relative path inside the destination folder', async () => {
    const image = {
      type: 'image' as const,
      asset: { kind: 'document-relative' as const, relativePath: 'images/cover.png' },
      alt: 'Cover',
      caption: null,
      location: { line: 1 },
    };

    await exportToTypst(documentWith([image]), docMeta, docPath, 'manuscript', 'B5', 'book-serif');

    expect(mkdirMock).toHaveBeenCalledWith('/Users/foo/export/images', { recursive: true });
    expect(copyFileMock).toHaveBeenCalledWith('/Users/foo/book/images/cover.png', '/Users/foo/export/images/cover.png');
    const sentRequest = JSON.parse(invokeMock.mock.calls[0][1].requestJson) as {
      assets: { path: string; resolvedPath: string }[];
    };
    expect(sentRequest.assets).toEqual([
      { path: 'images/cover.png', resolvedPath: '/Users/foo/book/images/cover.png', mediaType: 'image/png' },
    ]);
  });

  it('renders a Mermaid diagram to SVG, stages it under the app cache directory, and copies it into the export folder', async () => {
    renderMermaidToSvgStringMock.mockResolvedValue('<svg></svg>');
    const diagram = {
      type: 'diagram' as const,
      engine: 'mermaid' as const,
      code: 'graph TD\n A --> B',
      location: { line: 1 },
    };

    await exportToTypst(documentWith([diagram]), docMeta, docPath, 'manuscript', 'B5', 'book-serif');

    expect(renderMermaidToSvgStringMock).toHaveBeenCalledWith('graph TD\n A --> B', 'book-serif');
    // Staged under $APPCACHE first (collectDiagramAssets, shared with PDF export)...
    expect(mkdirMock).toHaveBeenCalledWith('/Users/foo/.cache/asciidoc-studio/mermaid', { recursive: true });
    expect(writeFileMock).toHaveBeenCalledWith(
      expect.stringContaining('/Users/foo/.cache/asciidoc-studio/mermaid/'),
      new TextEncoder().encode('<svg></svg>'),
    );
    // ...then copied into the export folder at the same relative path.
    expect(copyFileMock).toHaveBeenCalledWith(
      expect.stringContaining('/Users/foo/.cache/asciidoc-studio/mermaid/'),
      expect.stringMatching(/^\/Users\/foo\/export\/mermaid\//),
    );
  });

  // Regression: a diagram whose Mermaid rendering failed used to be silently
  // dropped instead of failing the export - a publishing tool must fail
  // loudly on missing content, not ship an incomplete project.
  it('fails the export instead of silently omitting a diagram whose Mermaid rendering failed', async () => {
    renderMermaidToSvgStringMock.mockResolvedValue(null);
    const diagram = { type: 'diagram' as const, engine: 'mermaid' as const, code: 'bad', location: { line: 1 } };

    const result = await exportToTypst(documentWith([diagram]), docMeta, docPath, 'manuscript', 'B5', 'book-serif');

    expect(result).toBe(false);
    expect(invokeMock).not.toHaveBeenCalled();
    expect(messageMock).toHaveBeenCalledWith(
      expect.stringContaining('Failed to render Mermaid diagram'),
      expect.objectContaining({ kind: 'error' }),
    );
  });

  it('prefers Book Project metadata and cover fields over manuscript attributes', async () => {
    await exportToTypst(documentWith([paragraph]), docMeta, docPath, 'manuscript', 'B5', 'book-serif', {
      title: 'Book Title',
      subtitle: 'A Subtitle',
      author: 'Book Author',
      language: '',
      identifier: '',
      publisher: 'Acme Press',
      description: '',
      rights: '',
      subjects: [],
      bibliography: [],
    });

    const sentRequest = JSON.parse(invokeMock.mock.calls[0][1].requestJson) as {
      document: SafeDocument;
      cover: { title: string; subtitle: string; author: string; publisher: string };
    };
    expect(sentRequest.document.metadata).toEqual({ title: 'Book Title', author: 'Book Author', language: 'ko' });
    expect(sentRequest.cover).toEqual({
      title: 'Book Title',
      subtitle: 'A Subtitle',
      author: 'Book Author',
      publisher: 'Acme Press',
      frontImagePath: '',
      backImagePath: '',
    });
  });

  it('threads Book Project bibliography entries into the request sent to Rust', async () => {
    const bibliography = [
      { key: 'smith2020', author: 'Jane Smith', title: 'A Great Book', year: '2020', publisher: '', url: '' },
    ];
    await exportToTypst(documentWith([paragraph]), docMeta, docPath, 'manuscript', 'B5', 'book-serif', {
      title: 'Book Title',
      subtitle: '',
      author: 'Book Author',
      language: '',
      identifier: '',
      publisher: '',
      description: '',
      rights: '',
      subjects: [],
      bibliography,
    });

    const sentRequest = JSON.parse(invokeMock.mock.calls[0][1].requestJson) as { bibliography: unknown };
    expect(sentRequest.bibliography).toEqual(bibliography);
  });

  it('shows an error message and returns false when the generator command fails', async () => {
    invokeMock.mockRejectedValue({
      code: 'nesting-depth-exceeded',
      message: 'Document nesting exceeds the supported depth (32).',
      line: 42,
    });
    const result = await exportToTypst(documentWith([paragraph]), docMeta, docPath, 'manuscript', 'B5', 'book-serif');
    expect(result).toBe(false);
    expect(messageMock).toHaveBeenCalledWith(
      expect.stringContaining('Document nesting exceeds the supported depth'),
      expect.objectContaining({ kind: 'error' }),
    );
  });
});
