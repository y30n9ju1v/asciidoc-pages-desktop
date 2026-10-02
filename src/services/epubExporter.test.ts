import { describe, it, expect, vi, beforeEach } from 'vitest';
import JSZip from 'jszip';
import type { SafeDocument } from './safeDocument';

const { readFileMock, chooseExportFileMock, messageMock, writeFileMock, toastSuccessMock } = vi.hoisted(() => ({
  readFileMock: vi.fn(),
  chooseExportFileMock: vi.fn(),
  messageMock: vi.fn(),
  writeFileMock: vi.fn(),
  toastSuccessMock: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-fs', () => ({ readFile: readFileMock, writeFile: writeFileMock }));
vi.mock('@tauri-apps/plugin-dialog', () => ({ message: messageMock }));
vi.mock('sonner', () => ({ toast: { success: toastSuccessMock } }));
// Mermaid needs a full browser layout engine to actually render - irrelevant to the
// cover-page feature under test here, so make it a no-op pass-through.
vi.mock('./mermaidRenderer', () => ({ renderMermaidBlocks: vi.fn().mockResolvedValue(undefined) }));
vi.mock('./publicationDialogAdapter', () => ({ chooseExportFile: chooseExportFileMock }));

const { exportToEpub } = await import('./epubExporter');

/** A single-section, single-paragraph SafeDocument, matching the old `<div class="sect1"><h2>Ch1</h2><p>Body</p></div>` test fixture. */
function bookWith(paragraphText: string, chapterTitle = 'Ch1'): SafeDocument {
  return {
    version: 1,
    metadata: { title: 'Test Book', author: 'Author', language: 'en' },
    diagnostics: [],
    blocks: [
      {
        type: 'section',
        id: null,
        title: chapterTitle,
        level: 1,
        location: { line: 1 },
        blocks: [
          {
            type: 'paragraph',
            text: paragraphText,
            inlines: [{ type: 'text', value: paragraphText }],
            location: { line: 2 },
          },
        ],
      },
    ],
  };
}

describe('exportToEpub front/back cover', () => {
  beforeEach(() => {
    readFileMock.mockReset();
    chooseExportFileMock.mockReset();
    messageMock.mockReset();
    writeFileMock.mockReset();
    toastSuccessMock.mockReset();
    chooseExportFileMock.mockResolvedValue('/Users/foo/book/output.epub');
  });

  const docPath = '/Users/foo/book/main.adoc';
  const docMeta = {
    title: 'Test Book',
    author: 'Author',
    email: '',
    lang: 'en',
    attributes: {
      'front-cover-image': 'images/cover.jpg',
      'back-cover-image': 'images/back.jpg',
    },
  };

  it('bundles front/back cover pages, images, and correct manifest/spine metadata', async () => {
    readFileMock.mockResolvedValue(new Uint8Array([1, 2, 3]));

    const success = await exportToEpub(bookWith('Body'), docMeta, docPath);
    expect(success).toBe(true);
    expect(toastSuccessMock).toHaveBeenCalledWith('EPUB published', { description: 'output.epub' });

    const bytes = writeFileMock.mock.calls[0][1] as Uint8Array;
    const zip = await JSZip.loadAsync(bytes);

    expect(zip.file('OEBPS/front-cover.xhtml')).not.toBeNull();
    expect(zip.file('OEBPS/back-cover.xhtml')).not.toBeNull();
    expect(zip.file('OEBPS/images/cover.jpg')).not.toBeNull();
    expect(zip.file('OEBPS/images/back.jpg')).not.toBeNull();

    const opf = await zip.file('OEBPS/content.opf')!.async('string');
    expect(opf).toContain('<meta name="cover" content="front-cover-image"/>');
    expect(opf).toContain('properties="cover-image"');
    expect(opf).toContain('href="images/cover.jpg"');
    expect(opf).toContain('href="images/back.jpg"');

    // Reading order: front cover first, back cover last.
    const spineMatch = opf.match(/<spine>([\s\S]*?)<\/spine>/)![1];
    const order = Array.from(spineMatch.matchAll(/idref="([^"]+)"/g)).map((m) => m[1]);
    expect(order[0]).toBe('front-cover-page');
    expect(order[order.length - 1]).toBe('back-cover-page');
  });

  it('omits cover manifest/spine entries entirely when no cover attributes are set', async () => {
    const success = await exportToEpub(bookWith('Body'), { ...docMeta, attributes: {} }, docPath);
    expect(success).toBe(true);

    const bytes = writeFileMock.mock.calls[0][1] as Uint8Array;
    const zip = await JSZip.loadAsync(bytes);

    expect(zip.file('OEBPS/front-cover.xhtml')).toBeNull();
    expect(zip.file('OEBPS/back-cover.xhtml')).toBeNull();

    const opf = await zip.file('OEBPS/content.opf')!.async('string');
    expect(opf).not.toContain('cover-image');
    expect(readFileMock).not.toHaveBeenCalled();
  });

  it('refuses a cover path that escapes the document folder', async () => {
    const success = await exportToEpub(
      bookWith('Body'),
      { ...docMeta, attributes: { 'front-cover-image': '../../../../etc/passwd' } },
      docPath,
    );
    expect(success).toBe(true);

    const bytes = writeFileMock.mock.calls[0][1] as Uint8Array;
    const zip = await JSZip.loadAsync(bytes);

    expect(zip.file('OEBPS/front-cover.xhtml')).toBeNull();
    expect(readFileMock).not.toHaveBeenCalled();
  });
});

describe('exportToEpub chapter structure', () => {
  beforeEach(() => {
    readFileMock.mockReset();
    chooseExportFileMock.mockReset();
    messageMock.mockReset();
    writeFileMock.mockReset();
    toastSuccessMock.mockReset();
    chooseExportFileMock.mockResolvedValue('/Users/foo/book/output.epub');
  });

  const docPath = '/Users/foo/book/main.adoc';
  const docMeta = { title: 'Test Book', author: 'Author', email: '', lang: 'en', attributes: {} };

  it('splits each top-level section into its own chapter file, titled from the section', async () => {
    const document: SafeDocument = {
      version: 1,
      metadata: { title: 'Test Book', author: 'Author', language: 'en' },
      diagnostics: [],
      blocks: [
        {
          type: 'section',
          id: null,
          title: 'Introduction',
          level: 1,
          location: { line: 1 },
          blocks: [
            { type: 'paragraph', text: 'First.', inlines: [{ type: 'text', value: 'First.' }], location: { line: 2 } },
          ],
        },
        {
          type: 'section',
          id: null,
          title: 'Conclusion',
          level: 1,
          location: { line: 3 },
          blocks: [
            { type: 'paragraph', text: 'Last.', inlines: [{ type: 'text', value: 'Last.' }], location: { line: 4 } },
          ],
        },
      ],
    };

    const success = await exportToEpub(document, docMeta, docPath);
    expect(success).toBe(true);

    const bytes = writeFileMock.mock.calls[0][1] as Uint8Array;
    const zip = await JSZip.loadAsync(bytes);
    const chapter1 = await zip.file('OEBPS/chapter1.xhtml')!.async('string');
    const chapter2 = await zip.file('OEBPS/chapter2.xhtml')!.async('string');

    expect(chapter1).toContain('Introduction');
    expect(chapter1).toContain('First.');
    expect(chapter2).toContain('Conclusion');
    expect(chapter2).toContain('Last.');

    const toc = await zip.file('OEBPS/toc.xhtml')!.async('string');
    expect(toc).toContain('chapter1.xhtml');
    expect(toc).toContain('chapter2.xhtml');
  });

  it('resolves a cite:[key] against the Book Project bibliography in the exported chapter', async () => {
    const document: SafeDocument = {
      version: 1,
      metadata: { title: 'Test Book', author: 'Author', language: 'en' },
      diagnostics: [],
      blocks: [
        {
          type: 'section',
          id: null,
          title: 'Introduction',
          level: 1,
          location: { line: 1 },
          blocks: [
            {
              type: 'paragraph',
              text: 'x',
              inlines: [{ type: 'citation', key: 'smith2020' }],
              location: { line: 2 },
            },
          ],
        },
      ],
    };
    const bookMetadata = {
      title: 'Test Book',
      subtitle: '',
      author: 'Author',
      language: 'en',
      identifier: '',
      publisher: '',
      description: '',
      rights: '',
      subjects: [],
      bibliography: [
        { key: 'smith2020', author: 'Jane Smith', title: 'A Great Book', year: '2020', publisher: '', url: '' },
      ],
    };

    const success = await exportToEpub(document, docMeta, docPath, undefined, undefined, bookMetadata);
    expect(success).toBe(true);

    const bytes = writeFileMock.mock.calls[0][1] as Uint8Array;
    const zip = await JSZip.loadAsync(bytes);
    const chapter1 = await zip.file('OEBPS/chapter1.xhtml')!.async('string');

    expect(chapter1).toContain('[1]');
    expect(chapter1).toContain('Jane Smith (2020). A Great Book.');
  });

  it('keeps content before the first section as its own Front Matter chapter instead of dropping it', async () => {
    const document: SafeDocument = {
      version: 1,
      metadata: { title: 'Test Book', author: 'Author', language: 'en' },
      diagnostics: [],
      blocks: [
        {
          type: 'paragraph',
          text: 'A preface before any chapter heading.',
          inlines: [{ type: 'text', value: 'A preface before any chapter heading.' }],
          location: { line: 1 },
        },
        {
          type: 'section',
          id: null,
          title: 'Chapter One',
          level: 1,
          location: { line: 3 },
          blocks: [
            { type: 'paragraph', text: 'Body.', inlines: [{ type: 'text', value: 'Body.' }], location: { line: 4 } },
          ],
        },
      ],
    };

    const success = await exportToEpub(document, docMeta, docPath);
    expect(success).toBe(true);

    const bytes = writeFileMock.mock.calls[0][1] as Uint8Array;
    const zip = await JSZip.loadAsync(bytes);

    const frontMatter = await zip.file('OEBPS/frontmatter.xhtml')!.async('string');
    expect(frontMatter).toContain('A preface before any chapter heading.');

    const opf = await zip.file('OEBPS/content.opf')!.async('string');
    expect(opf).toContain('href="frontmatter.xhtml"');
    // Front matter reads before chapter1 in the spine.
    const spineMatch = opf.match(/<spine>([\s\S]*?)<\/spine>/)![1];
    const order = Array.from(spineMatch.matchAll(/idref="([^"]+)"/g)).map((m) => m[1]);
    expect(order.indexOf('frontmatter')).toBeLessThan(order.indexOf('chapter1'));
  });
});

describe('exportToEpub code block syntax highlighting', () => {
  beforeEach(() => {
    readFileMock.mockReset();
    chooseExportFileMock.mockReset();
    messageMock.mockReset();
    writeFileMock.mockReset();
    toastSuccessMock.mockReset();
    chooseExportFileMock.mockResolvedValue('/Users/foo/book/output.epub');
  });

  const docPath = '/Users/foo/book/main.adoc';
  const docMeta = { title: 'Test Book', author: 'Author', email: '', lang: 'en', attributes: {} };

  // Regression test: epubExporter.ts used to bundle highlight.js's CSS but never
  // actually run hljs.highlightElement() on the chapter HTML, so code blocks had
  // no <span class="hljs-..."> markup for that CSS to style - same root cause as
  // the same local-file URL issue, just missed in the EPUB path at the time.
  it('applies highlight.js spans to code blocks in the exported chapter', async () => {
    const document: SafeDocument = {
      version: 1,
      metadata: { title: 'Test Book', author: 'Author', language: 'en' },
      diagnostics: [],
      blocks: [
        {
          type: 'section',
          id: null,
          title: 'Ch1',
          level: 1,
          location: { line: 1 },
          blocks: [{ type: 'code', language: 'js', code: 'const x = 1;', location: { line: 2 } }],
        },
      ],
    };

    const success = await exportToEpub(document, docMeta, docPath);
    expect(success).toBe(true);

    const bytes = writeFileMock.mock.calls[0][1] as Uint8Array;
    const zip = await JSZip.loadAsync(bytes);
    const chapter1 = await zip.file('OEBPS/chapter1.xhtml')!.async('string');

    expect(chapter1).toContain('class="hljs');
    expect(chapter1).toMatch(/<span[^>]*>/);
  });

  it('writes optional book-project metadata as EPUB Dublin Core fields', async () => {
    const success = await exportToEpub(bookWith('Body'), docMeta, docPath, undefined, undefined, {
      title: 'Publishing with AsciiDoc',
      subtitle: 'A practical guide',
      author: 'Ada Writer',
      language: 'en',
      identifier: '9781234567890',
      publisher: 'Studio Press',
      description: 'A book about publishing.',
      rights: 'Copyright 2026 Ada Writer',
      subjects: ['Technology', 'Writing'],
      bibliography: [],
    });
    expect(success).toBe(true);

    const bytes = writeFileMock.mock.calls[0][1] as Uint8Array;
    const zip = await JSZip.loadAsync(bytes);
    const opf = await zip.file('OEBPS/content.opf')!.async('string');

    expect(opf).toContain('<dc:identifier id="BookId">9781234567890</dc:identifier>');
    expect(opf).toContain('<dc:title id="subtitle">A practical guide</dc:title>');
    expect(opf).toContain('<dc:publisher>Studio Press</dc:publisher>');
    expect(opf).toContain('<dc:subject>Technology</dc:subject>');
  });
});
