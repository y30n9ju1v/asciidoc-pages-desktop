import { load, LoggerManager, MemoryLogger, Document } from '@asciidoctor/core';
import { renderSafeDocumentToHtml } from './safeHtmlRenderer';
import { normalizeSafeDocument, plainText, type SafeDocument } from './safeDocument';
import { rewritePageReferencesForRender } from './safeInline';
import type { BibliographyEntry } from './bibliographyService';
import { errorRenderResult } from './renderErrorResult';

export interface AsciidocDocMeta {
  title: string;
  author: string;
  email: string;
  lang: string;
  /** Asciidoctor attributes are external document input; consumers narrow
   * individual values before using them in an export or renderer. */
  attributes: Record<string, unknown>;
}

export interface AsciidocRenderResult {
  /** Previous output remains available while a newer source revision is rendering. */
  isPending?: boolean;
  html: string;
  meta: AsciidocDocMeta;
  /** Optional during the migration so external render adapters remain compatible. */
  safeDocument?: SafeDocument;
  /** Set only when a pipeline boundary outside Asciidoctor fails. Keeping this
   * separate from `html` lets every consumer show a useful error instead of
   * mistaking a failed render for a document that is still loading. */
  renderError?: string;
}

const DEFAULT_ATTRIBUTES = {
  showtitle: true,
  'source-highlighter': 'highlight.js',
  icons: 'font',
  sectnums: true,
  toc: 'auto',
  // Forces stem:[...]/[stem] blocks to use LaTeX delimiters (\( \), \[ \]) rather
  // than AsciiMath, since KaTeX (mathRenderer.ts) only understands LaTeX.
  stem: 'latexmath',
};

function extractMeta(doc: Document): AsciidocDocMeta {
  // Like SafeDocument's own titles/captions, these are Asciidoctor's
  // already-substituted text (inline markup as generated tags, "&" as
  // "&amp;", typographic replacements as numeric entities) - plainText()
  // strips the former and decodes the latter the same way.
  const title = doc.getDocumentTitle();
  return {
    title: title ? plainText(String(title)) : 'Untitled Document',
    author: plainText(doc.getAuthor() || ''),
    email: doc.getAttribute('email') || '',
    lang: doc.getAttribute('lang') || 'en',
    attributes: doc.getAttributes() || {},
  };
}

export { errorRenderResult } from './renderErrorResult';

// @asciidoctor/core v4 is WASM-backed and its `load`/`convert` APIs are Promise-based,
// even though older asciidoctor.js versions were synchronous.
export const renderAsciidoc = async (
  content: string,
  bibliography: BibliographyEntry[] = [],
): Promise<AsciidocRenderResult> => {
  try {
    LoggerManager.setLogger(MemoryLogger.create());

    const doc = await load(rewritePageReferencesForRender(content), {
      safe: 'safe',
      sourcemap: true,
      attributes: DEFAULT_ATTRIBUTES,
    });
    const meta = extractMeta(doc);
    const safeDocument = normalizeSafeDocument(doc, { title: meta.title, author: meta.author, language: meta.lang });

    return {
      html: renderSafeDocumentToHtml(safeDocument, bibliography),
      meta,
      safeDocument,
    };
  } catch (error) {
    console.error('Failed to convert AsciiDoc:', error);
    return errorRenderResult(error);
  }
};
