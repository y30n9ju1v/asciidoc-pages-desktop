import { describe, expect, it, vi } from 'vitest';
import type { RenderPipelineDependencies } from './renderPipeline';
import { renderDocumentPreview } from './renderPipeline';
import type { SafeDocument } from './safeDocument';

const safeDocument: SafeDocument = {
  version: 1,
  metadata: { title: 'Book', author: '', language: 'en' },
  diagnostics: [],
  blocks: [],
};

const dependencies: RenderPipelineDependencies = {
  resolveIncludes: vi.fn(async (content: string) => `${content}|includes`),
  rewriteWikilinks: vi.fn((content: string) => `${content}|wikilinks`),
  renderAsciidoc: vi.fn(async (content: string) => ({
    html: `${content}|rendered`,
    meta: { title: 'Book', author: '', email: '', lang: 'en', attributes: {} },
    safeDocument,
  })),
  loadMathRenderer: vi.fn(async () => (html: string) => `${html}|math`),
  groupFootnotes: vi.fn((html: string) => `${html}|footnotes`),
  sanitizeHtml: vi.fn((html: string) => `${html}|sanitized`),
  resolveImages: vi.fn(async (html: string) => `${html}|images`),
};

describe('renderDocumentPreview', () => {
  it('runs every untrusted-content transform in the required order', async () => {
    const bibliography = [
      { key: 'smith2020', author: 'Jane Smith', title: 'A Great Book', year: '2020', publisher: '', url: '' },
    ];
    const result = await renderDocumentPreview(
      { content: 'source', currentPath: '/book/main.adoc', notes: [], bibliography },
      dependencies,
    );

    expect(result.html).toBe('source|includes|wikilinks|rendered|math|footnotes|sanitized|images');
    expect(result.meta.title).toBe('Book');
    expect(dependencies.resolveIncludes).toHaveBeenCalledWith('source', '/book/main.adoc');
    // Regression: bibliography must actually reach renderAsciidoc (so the
    // live preview can resolve cite:[key] markers), not just type-check -
    // usePreview.ts/renderAsciidocOffThread all sit between
    // App.tsx and this call with nothing else to catch a dropped argument.
    expect(dependencies.renderAsciidoc).toHaveBeenCalledWith('source|includes|wikilinks', bibliography);
    expect(dependencies.resolveImages).toHaveBeenCalledWith(
      'source|includes|wikilinks|rendered|math|footnotes|sanitized',
      '/book/main.adoc',
    );
  });
});
