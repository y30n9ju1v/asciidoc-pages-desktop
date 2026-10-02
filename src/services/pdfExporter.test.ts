import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SafeDocument } from './safeDocument';

const {
  chooseExportFileMock,
  messageMock,
  toastSuccessMock,
  writeFileMock,
  mkdirMock,
  renameMock,
  removeMock,
  copyFileMock,
  existsMock,
  invokeMock,
  appCacheDirMock,
  renderMermaidToSvgStringMock,
} = vi.hoisted(() => ({
  chooseExportFileMock: vi.fn(),
  messageMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  writeFileMock: vi.fn(),
  mkdirMock: vi.fn(),
  renameMock: vi.fn(),
  removeMock: vi.fn(),
  copyFileMock: vi.fn(),
  existsMock: vi.fn(),
  invokeMock: vi.fn(),
  appCacheDirMock: vi.fn(),
  renderMermaidToSvgStringMock: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-fs', () => ({
  writeFile: writeFileMock,
  mkdir: mkdirMock,
  rename: renameMock,
  remove: removeMock,
  copyFile: copyFileMock,
  exists: existsMock,
}));
vi.mock('@tauri-apps/plugin-dialog', () => ({ message: messageMock }));
vi.mock('sonner', () => ({ toast: { success: toastSuccessMock } }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: invokeMock }));
vi.mock('@tauri-apps/api/path', () => ({ appCacheDir: appCacheDirMock }));
vi.mock('./mermaidRenderer', () => ({ renderMermaidToSvgString: renderMermaidToSvgStringMock }));
vi.mock('./publicationDialogAdapter', () => ({ chooseExportFile: chooseExportFileMock }));

const { exportToPdf } = await import('./pdfExporter');

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

describe('exportToPdf', () => {
  beforeEach(() => {
    chooseExportFileMock.mockReset();
    messageMock.mockReset();
    toastSuccessMock.mockReset();
    writeFileMock.mockReset();
    mkdirMock.mockReset();
    renameMock.mockReset();
    removeMock.mockReset();
    copyFileMock.mockReset();
    existsMock.mockReset();
    invokeMock.mockReset();
    appCacheDirMock.mockReset();
    renderMermaidToSvgStringMock.mockReset();
    chooseExportFileMock.mockResolvedValue('/Users/foo/book/output.pdf');
    renameMock.mockResolvedValue(undefined);
    removeMock.mockResolvedValue(undefined);
    copyFileMock.mockResolvedValue(undefined);
    // Most tests exercise a brand-new export destination - the copyFile
    // fallback's "did this already exist" check defaults to false.
    existsMock.mockResolvedValue(false);
    appCacheDirMock.mockResolvedValue('/Users/foo/.cache/asciidoc-studio');
    // compile_typst_pdf now returns the path to a Rust-owned temp file, not
    // PDF bytes - see the doc comment on publishCompiledPdf in
    // pdfExporter.ts for why.
    invokeMock.mockResolvedValue('/Users/foo/.cache/asciidoc-studio/publish/1-100-0.pdf');
  });

  const paragraph = {
    type: 'paragraph' as const,
    text: 'x',
    inlines: [{ type: 'text' as const, value: 'x' }],
    location: { line: 1 },
  };

  it('sends a PdfPublicationRequest to compile_typst_pdf and renames the returned temp file directly onto the destination', async () => {
    const result = await exportToPdf(
      documentWith([paragraph]),
      docMeta,
      docPath,
      'manuscript',
      'B5',
      'book-serif',
      false,
    );
    expect(result).toEqual({ success: true, errorLine: null });

    expect(invokeMock).toHaveBeenCalledWith('compile_typst_pdf', { requestJson: expect.any(String) });
    const sentRequest = JSON.parse(invokeMock.mock.calls[0][1].requestJson);
    expect(sentRequest).toMatchObject({
      template: { id: 'manuscript' },
      pageSize: { id: 'B5' },
      assets: [],
      pdfA: false,
      documentRoot: '/Users/foo/book',
    });

    // rename() straight from Rust's temp file onto the final destination -
    // no differently-named sibling file at the destination, since the native
    // save picker only grants fs scope for that exact literal path (see the
    // comment on publishCompiledPdf in pdfExporter.ts).
    expect(renameMock).toHaveBeenCalledWith(
      '/Users/foo/.cache/asciidoc-studio/publish/1-100-0.pdf',
      '/Users/foo/book/output.pdf',
    );
    expect(copyFileMock).not.toHaveBeenCalled();
    // A no-op after a successful rename (the file already moved), but
    // always attempted regardless.
    expect(removeMock).toHaveBeenCalledWith('/Users/foo/.cache/asciidoc-studio/publish/1-100-0.pdf');
    expect(toastSuccessMock).toHaveBeenCalledWith('PDF published', { description: 'output.pdf' });
  });

  // Regression: rename() fails with EXDEV across filesystem/volume
  // boundaries (destination on an external drive or network share) - this
  // must fall back to copyFile() rather than failing the whole export.
  it('falls back to copyFile when rename fails (e.g. a cross-volume destination)', async () => {
    renameMock.mockRejectedValue(new Error('EXDEV: cross-device link not permitted'));
    const result = await exportToPdf(
      documentWith([paragraph]),
      docMeta,
      docPath,
      'manuscript',
      'B5',
      'book-serif',
      false,
    );
    expect(result).toEqual({ success: true, errorLine: null });

    expect(copyFileMock).toHaveBeenCalledWith(
      '/Users/foo/.cache/asciidoc-studio/publish/1-100-0.pdf',
      '/Users/foo/book/output.pdf',
    );
    // The fallback doesn't move the file, so cleanup here does real work.
    expect(removeMock).toHaveBeenCalledWith('/Users/foo/.cache/asciidoc-studio/publish/1-100-0.pdf');
    expect(toastSuccessMock).toHaveBeenCalledWith('PDF published', { description: 'output.pdf' });
  });

  // When both the rename and its copyFile fallback fail, the export must
  // fail loudly (not silently succeed) and still clean up Rust's temp file.
  // The destination never existed before this export, so the failed
  // copyFile's debris at `destination` is removed rather than left behind.
  it('fails the export when both rename and the copyFile fallback fail, and removes debris at a brand-new destination', async () => {
    renameMock.mockRejectedValue(new Error('EXDEV'));
    copyFileMock.mockRejectedValue(new Error('disk full'));
    existsMock.mockResolvedValue(false);
    const result = await exportToPdf(
      documentWith([paragraph]),
      docMeta,
      docPath,
      'manuscript',
      'B5',
      'book-serif',
      false,
    );
    expect(result).toEqual({ success: false, errorLine: null });
    expect(removeMock).toHaveBeenCalledWith('/Users/foo/.cache/asciidoc-studio/publish/1-100-0.pdf');
    expect(removeMock).toHaveBeenCalledWith('/Users/foo/book/output.pdf');
    expect(messageMock).toHaveBeenCalledWith(
      expect.stringContaining('disk full'),
      expect.objectContaining({ kind: 'error' }),
    );
  });

  // Regression: overwriting an existing PDF whose rename AND copyFile
  // fallback both fail used to report the exact same generic message as a
  // brand-new destination, even though a failed copyFile there may have
  // partially overwritten and corrupted the user's existing file - a case
  // that deserves a distinct, more alarming message, not the debris-cleanup
  // treatment (there is nothing to safely delete: it might still hold
  // recoverable content).
  it('warns about possible corruption instead of deleting the file when overwriting an existing destination fails', async () => {
    renameMock.mockRejectedValue(new Error('EXDEV'));
    copyFileMock.mockRejectedValue(new Error('disk full'));
    existsMock.mockResolvedValue(true);
    const result = await exportToPdf(
      documentWith([paragraph]),
      docMeta,
      docPath,
      'manuscript',
      'B5',
      'book-serif',
      false,
    );
    expect(result).toEqual({ success: false, errorLine: null });
    expect(removeMock).not.toHaveBeenCalledWith('/Users/foo/book/output.pdf');
    expect(messageMock).toHaveBeenCalledWith(
      expect.stringMatching(/may now be corrupted.*disk full/),
      expect.objectContaining({ kind: 'error' }),
    );
  });

  // The cleanup attempt itself must never mask the original failure, even
  // when removing the (possibly never-moved) temp file also fails.
  it('still surfaces the original error when the cleanup remove call also fails', async () => {
    renameMock.mockRejectedValue(new Error('EXDEV'));
    copyFileMock.mockRejectedValue(new Error('disk full'));
    removeMock.mockRejectedValue(new Error('ENOENT'));
    const result = await exportToPdf(
      documentWith([paragraph]),
      docMeta,
      docPath,
      'manuscript',
      'B5',
      'book-serif',
      false,
    );
    expect(result).toEqual({ success: false, errorLine: null });
    expect(messageMock).toHaveBeenCalledWith(
      expect.stringContaining('disk full'),
      expect.objectContaining({ kind: 'error' }),
    );
  });

  it('does not invoke the compiler when the save dialog is cancelled', async () => {
    chooseExportFileMock.mockResolvedValue(null);
    const result = await exportToPdf(
      documentWith([paragraph]),
      docMeta,
      docPath,
      'manuscript',
      'B5',
      'book-serif',
      false,
    );
    expect(result).toEqual({ success: false, errorLine: null });
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it('reports the loading-assets/compiling/saving phase transitions in order', async () => {
    const phases: string[] = [];
    await exportToPdf(documentWith([paragraph]), docMeta, docPath, 'manuscript', 'B5', 'book-serif', false, undefined, {
      onPhaseChange: (phase) => phases.push(phase),
    });
    expect(phases).toEqual(['loading-assets', 'compiling', 'saving']);
  });

  it('bails out before invoking the compiler when cancelled before the compile phase', async () => {
    const controller = new AbortController();
    controller.abort();
    const result = await exportToPdf(
      documentWith([paragraph]),
      docMeta,
      docPath,
      'manuscript',
      'B5',
      'book-serif',
      false,
      undefined,
      {
        signal: controller.signal,
      },
    );
    expect(result).toEqual({ success: false, errorLine: null });
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it('prefers Book Project metadata over manuscript attributes over the SafeDocument default', async () => {
    await exportToPdf(documentWith([paragraph]), docMeta, docPath, 'manuscript', 'B5', 'book-serif', false, {
      title: 'Book Title',
      subtitle: '',
      author: 'Book Author',
      language: '',
      identifier: '',
      publisher: '',
      description: '',
      rights: '',
      subjects: [],
      bibliography: [],
    });

    const sentRequest = JSON.parse(invokeMock.mock.calls[0][1].requestJson) as { document: SafeDocument };
    expect(sentRequest.document.metadata).toEqual({ title: 'Book Title', author: 'Book Author', language: 'ko' });
  });

  it('threads Book Project bibliography entries into the request sent to Rust', async () => {
    const bibliography = [
      { key: 'smith2020', author: 'Jane Smith', title: 'A Great Book', year: '2020', publisher: '', url: '' },
    ];
    await exportToPdf(documentWith([paragraph]), docMeta, docPath, 'manuscript', 'B5', 'book-serif', false, {
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

  it('falls back through docMeta then the SafeDocument metadata when no Book Project exists', async () => {
    await exportToPdf(documentWith([paragraph]), docMeta, docPath, 'manuscript', 'B5', 'book-serif', false);

    const sentRequest = JSON.parse(invokeMock.mock.calls[0][1].requestJson) as { document: SafeDocument };
    expect(sentRequest.document.metadata).toEqual({ title: 'Meta Title', author: 'Meta Author', language: 'ko' });
  });

  it('bundles a document-relative image asset as a boundary-checked path reference, not bytes', async () => {
    const image = {
      type: 'image' as const,
      asset: { kind: 'document-relative' as const, relativePath: 'cover.png' },
      alt: 'Cover',
      caption: null,
      location: { line: 1 },
    };

    await exportToPdf(documentWith([image]), docMeta, docPath, 'manuscript', 'B5', 'book-serif', false);

    const sentRequest = JSON.parse(invokeMock.mock.calls[0][1].requestJson) as {
      assets: { path: string; resolvedPath: string }[];
    };
    expect(sentRequest.assets).toEqual([
      { path: 'cover.png', resolvedPath: '/Users/foo/book/cover.png', mediaType: 'image/png' },
    ]);
  });

  it('renders a Mermaid diagram to SVG, writes it under the app cache directory, and bundles it as a path reference', async () => {
    renderMermaidToSvgStringMock.mockResolvedValue('<svg></svg>');
    const diagram = {
      type: 'diagram' as const,
      engine: 'mermaid' as const,
      code: 'graph TD\n A --> B',
      location: { line: 1 },
    };

    await exportToPdf(documentWith([diagram]), docMeta, docPath, 'manuscript', 'B5', 'book-serif', false);

    expect(renderMermaidToSvgStringMock).toHaveBeenCalledWith('graph TD\n A --> B', 'book-serif');
    expect(mkdirMock).toHaveBeenCalledWith('/Users/foo/.cache/asciidoc-studio/mermaid', { recursive: true });
    expect(writeFileMock).toHaveBeenCalledWith(
      expect.stringContaining('/Users/foo/.cache/asciidoc-studio/mermaid/'),
      new TextEncoder().encode('<svg></svg>'),
    );
    const sentRequest = JSON.parse(invokeMock.mock.calls[0][1].requestJson) as {
      assets: { mediaType: string }[];
    };
    expect(sentRequest.assets).toEqual([expect.objectContaining({ mediaType: 'image/svg+xml' })]);
  });

  // Regression: a diagram whose Mermaid rendering failed used to be silently
  // dropped from the published PDF instead of failing the export - a
  // publishing tool must fail loudly on missing content, not ship an
  // incomplete PDF with no indication anything went wrong.
  it('fails the export instead of silently omitting a diagram whose Mermaid rendering failed', async () => {
    renderMermaidToSvgStringMock.mockResolvedValue(null);
    const diagram = { type: 'diagram' as const, engine: 'mermaid' as const, code: 'bad', location: { line: 1 } };

    const result = await exportToPdf(
      documentWith([diagram]),
      docMeta,
      docPath,
      'manuscript',
      'B5',
      'book-serif',
      false,
    );

    expect(result).toEqual({ success: false, errorLine: null });
    expect(invokeMock).not.toHaveBeenCalled();
    expect(messageMock).toHaveBeenCalledWith(
      expect.stringContaining('Failed to render Mermaid diagram'),
      expect.objectContaining({ kind: 'error' }),
    );
  });

  it('passes pdfA through to the request', async () => {
    await exportToPdf(documentWith([paragraph]), docMeta, docPath, 'manuscript', 'B5', 'book-serif', true);
    const sentRequest = JSON.parse(invokeMock.mock.calls[0][1].requestJson) as { pdfA: boolean };
    expect(sentRequest.pdfA).toBe(true);
  });

  it('shows an error message and returns false when the compiler fails', async () => {
    invokeMock.mockRejectedValue(new Error('Typst compilation failed'));
    const result = await exportToPdf(
      documentWith([paragraph]),
      docMeta,
      docPath,
      'manuscript',
      'B5',
      'book-serif',
      false,
    );
    expect(result).toEqual({ success: false, errorLine: null });
    expect(messageMock).toHaveBeenCalledWith(
      expect.stringContaining('Typst compilation failed'),
      expect.objectContaining({ kind: 'error' }),
    );
  });

  // Regression: at_line=... string-prefix parsing used to be the only way
  // to recover a location from a compile failure - PublishError is now a
  // structured { code, message, line } object, so the rejected invoke()
  // value can be read directly as a field, no regex involved.
  it('extracts the error line from a structured PublishError rejection', async () => {
    invokeMock.mockRejectedValue({
      code: 'nesting-depth-exceeded',
      message: 'Document nesting exceeds the supported depth (32).',
      line: 42,
    });
    const result = await exportToPdf(
      documentWith([paragraph]),
      docMeta,
      docPath,
      'manuscript',
      'B5',
      'book-serif',
      false,
    );
    expect(result).toEqual({ success: false, errorLine: 42 });
    expect(messageMock).toHaveBeenCalledWith(
      expect.stringContaining('Document nesting exceeds the supported depth'),
      expect.objectContaining({ kind: 'error' }),
    );
  });
});
