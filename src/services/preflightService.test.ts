import { describe, expect, it } from 'vitest';
import { createBookMetadata } from './bookProjectService';
import { getPublicationStyle } from './publicationStyleService';
import { runPreflight } from './preflightService';

const renderResult = {
  html: '<h1>Book</h1>',
  meta: { title: 'Book', author: 'Author', email: '', lang: 'en', attributes: {} },
};

describe('runPreflight', () => {
  it('accepts a saved manuscript with the required book details', () => {
    const metadata = createBookMetadata(renderResult.meta);
    metadata.identifier = '9781234567890';
    metadata.description = 'A practical guide.';

    expect(
      runPreflight({
        renderResult,
        currentPath: '/Books/book/main.adoc',
        vaultRoot: '/Books/book',
        metadata,
        images: [],
      }),
    ).toEqual(expect.objectContaining({ ready: true, pdfReady: true, errorCount: 0, warningCount: 0 }));
  });

  it('includes non-blocking print-proof findings for the selected publication style', () => {
    const metadata = createBookMetadata(renderResult.meta);
    const bookStyle = getPublicationStyle('book-serif');
    const report = runPreflight({
      renderResult,
      currentPath: '/Books/book/main.adoc',
      vaultRoot: '/Books/book',
      metadata,
      images: [],
      pageSizeId: 'A5',
      publicationStyle: {
        ...bookStyle,
        typst: { ...bookStyle.typst, baseFontSizePt: 9, bodyJustification: false },
      },
    });

    expect(report.ready).toBe(true);
    expect(report.pdfReady).toBe(true);
    expect(report.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'print-small-body-type', severity: 'warning' }),
        expect.objectContaining({ id: 'print-ragged-paragraphs', severity: 'info' }),
      ]),
    );
  });

  it('blocks an unsaved or failed manuscript', () => {
    const metadata = createBookMetadata(renderResult.meta);
    const report = runPreflight({
      renderResult: { ...renderResult, html: '', meta: { ...renderResult.meta, title: 'Error' } },
      currentPath: null,
      vaultRoot: null,
      metadata,
      images: [],
    });

    expect(report.ready).toBe(false);
    expect(report.pdfReady).toBe(false);
    expect(report.issues.map((current) => current.id)).toEqual(
      expect.arrayContaining(['unsaved-manuscript', 'render-failed']),
    );
  });

  it('warns about remote and inaccessible images without blocking HTML/EPUB export, but blocks PDF', () => {
    const metadata = createBookMetadata(renderResult.meta);
    const report = runPreflight({
      renderResult,
      currentPath: '/Books/book/main.adoc',
      vaultRoot: '/Books/book',
      metadata,
      images: [{ src: 'https://example.com/diagram.png', alt: null }],
    });

    expect(report.ready).toBe(true);
    expect(report.pdfReady).toBe(false);
    expect(report.issues.map((current) => current.id)).toEqual(
      expect.arrayContaining(['remote-image', 'missing-alt-text']),
    );
  });

  it('blocks file URLs even if rendering output was produced', () => {
    const metadata = createBookMetadata(renderResult.meta);
    const report = runPreflight({
      renderResult,
      currentPath: '/Books/book/main.adoc',
      vaultRoot: '/Books/book',
      metadata,
      images: [{ src: 'file:///Users/reader/private.png', alt: 'Private' }],
    });

    expect(report.ready).toBe(false);
    expect(report.issues).toContainEqual(expect.objectContaining({ id: 'local-file-url', severity: 'error' }));
  });

  it('blocks publication when the safe document model rejects content', () => {
    const metadata = createBookMetadata(renderResult.meta);
    metadata.identifier = '9781234567890';
    metadata.description = 'A practical guide.';
    const report = runPreflight({
      renderResult: {
        ...renderResult,
        safeDocument: {
          version: 1,
          metadata: { title: 'Book', author: 'Author', language: 'en' },
          blocks: [],
          diagnostics: [
            {
              code: 'unsafe-raw-content',
              severity: 'error',
              message: 'Raw passthrough blocks are not supported.',
              location: { line: 8 },
            },
          ],
        },
      },
      currentPath: '/Books/book/main.adoc',
      vaultRoot: '/Books/book',
      metadata,
      images: [],
    });

    expect(report).toEqual(
      expect.objectContaining({
        ready: false,
        issues: expect.arrayContaining([
          expect.objectContaining({
            id: 'safe-document-unsafe-raw-content',
            severity: 'error',
            detail: expect.stringContaining('line 8'),
          }),
        ]),
      }),
    );
  });

  // Regression: publishing an image via a document opened as a single file
  // (not a vault folder) used to fail with an opaque Rust error at compile
  // time - Rust only trusts document_root when it's within the fs plugin's
  // dialog-granted runtime scope, and a single-file picker only grants
  // access to that one file, never its containing directory. This must
  // surface as a clear, actionable preflight warning instead.
  it('warns that PDF needs an open vault when the document has local images but no vault is open', () => {
    const metadata = createBookMetadata(renderResult.meta);
    const report = runPreflight({
      renderResult: {
        ...renderResult,
        safeDocument: {
          version: 1,
          metadata: { title: 'Book', author: 'Author', language: 'en' },
          diagnostics: [],
          blocks: [
            {
              type: 'image',
              asset: { kind: 'document-relative', relativePath: 'cover.png' },
              alt: 'Cover',
              caption: null,
              location: { line: 1 },
            },
          ],
        },
      },
      currentPath: '/Books/book/main.adoc',
      vaultRoot: null,
      metadata,
      images: [],
    });

    expect(report.ready).toBe(true);
    expect(report.pdfReady).toBe(false);
    expect(report.issues).toContainEqual(
      expect.objectContaining({ id: 'pdf-images-need-open-folder', severity: 'warning' }),
    );
  });

  it('does not warn about local images once a vault is open', () => {
    const metadata = createBookMetadata(renderResult.meta);
    const report = runPreflight({
      renderResult: {
        ...renderResult,
        safeDocument: {
          version: 1,
          metadata: { title: 'Book', author: 'Author', language: 'en' },
          diagnostics: [],
          blocks: [
            {
              type: 'image',
              asset: { kind: 'document-relative', relativePath: 'cover.png' },
              alt: 'Cover',
              caption: null,
              location: { line: 1 },
            },
          ],
        },
      },
      currentPath: '/Books/book/main.adoc',
      vaultRoot: '/Books/book',
      metadata,
      images: [],
    });

    expect(report.pdfReady).toBe(true);
    expect(report.issues.map((current) => current.id)).not.toContain('pdf-images-need-open-folder');
  });

  it('warns when an image document is outside the currently open vault', () => {
    const metadata = createBookMetadata(renderResult.meta);
    const report = runPreflight({
      renderResult: {
        ...renderResult,
        safeDocument: {
          version: 1,
          metadata: { title: 'Book', author: 'Author', language: 'en' },
          diagnostics: [],
          blocks: [
            {
              type: 'image',
              asset: { kind: 'document-relative', relativePath: 'cover.png' },
              alt: 'Cover',
              caption: null,
              location: { line: 1 },
            },
          ],
        },
      },
      currentPath: '/Elsewhere/essay/main.adoc',
      vaultRoot: '/Books/book',
      metadata,
      images: [],
    });

    expect(report.pdfReady).toBe(false);
    expect(report.issues).toContainEqual(
      expect.objectContaining({ id: 'pdf-images-need-open-folder', severity: 'warning' }),
    );
  });

  it('does not warn when the document has no local images even without a vault open', () => {
    const metadata = createBookMetadata(renderResult.meta);
    const report = runPreflight({
      renderResult,
      currentPath: '/Books/book/main.adoc',
      vaultRoot: null,
      metadata,
      images: [],
    });

    expect(report.pdfReady).toBe(true);
    expect(report.issues.map((current) => current.id)).not.toContain('pdf-images-need-open-folder');
  });

  it('warns (without blocking) about a cited key missing from the bibliography, and stays quiet once it resolves', () => {
    const metadata = createBookMetadata(renderResult.meta);
    metadata.identifier = '9781234567890';
    metadata.description = 'A practical guide.';
    const safeDocument = {
      version: 1 as const,
      metadata: { title: 'Book', author: 'Author', language: 'en' },
      diagnostics: [],
      blocks: [
        {
          type: 'paragraph' as const,
          text: 'x',
          inlines: [{ type: 'citation' as const, key: 'missing2021' }],
          location: { line: 3 },
        },
      ],
    };
    const unresolved = runPreflight({
      renderResult: { ...renderResult, safeDocument },
      currentPath: '/Books/book/main.adoc',
      vaultRoot: '/Books/book',
      metadata,
      images: [],
    });
    expect(unresolved.errorCount).toBe(0);
    expect(unresolved.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'unresolved-citation-missing2021', severity: 'warning' })]),
    );

    metadata.bibliography = [{ key: 'missing2021', author: 'A', title: 'T', year: '', publisher: '', url: '' }];
    const resolved = runPreflight({
      renderResult: { ...renderResult, safeDocument },
      currentPath: '/Books/book/main.adoc',
      vaultRoot: '/Books/book',
      metadata,
      images: [],
    });
    expect(resolved.issues.map((current) => current.id)).not.toContain('unresolved-citation-missing2021');
  });

  it('blocks missing includes and points preflight at the directive', () => {
    const metadata = createBookMetadata(renderResult.meta);
    const report = runPreflight({
      renderResult,
      currentPath: '/Books/book/main.adoc',
      vaultRoot: '/Books/book',
      metadata,
      images: [],
      content: '= Book\n\ninclude::missing.adoc[]',
      notes: [],
    });
    expect(report.ready).toBe(false);
    expect(report.issues).toContainEqual(expect.objectContaining({ id: 'include-missing-3', line: 3 }));
  });

  it('blocks publishing a manuscript with a missing cross-reference', () => {
    const metadata = createBookMetadata(renderResult.meta);
    const report = runPreflight({
      renderResult: {
        ...renderResult,
        safeDocument: {
          version: 1 as const,
          metadata: { title: 'Book', author: 'Author', language: 'en' },
          diagnostics: [],
          blocks: [
            {
              type: 'paragraph' as const,
              text: 'See the missing section.',
              inlines: [
                {
                  type: 'link' as const,
                  target: '#missing-section',
                  children: [{ type: 'text' as const, value: 'the missing section' }],
                  hasExplicitLabel: false,
                  isWikilink: false,
                  isUnresolvedWikilink: false,
                },
              ],
              location: { line: 3 },
            },
          ],
        },
      },
      currentPath: '/Books/book/main.adoc',
      vaultRoot: '/Books/book',
      metadata,
      images: [],
    });

    expect(report.ready).toBe(false);
    expect(report.pdfReady).toBe(false);
    expect(report.issues).toContainEqual(
      expect.objectContaining({
        id: 'broken-cross-reference-missing-section',
        severity: 'error',
        line: 3,
      }),
    );
  });
});
