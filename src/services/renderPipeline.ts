import type { AsciidocRenderResult } from './asciidocService';
import type { BibliographyEntry } from './bibliographyService';
import type { VaultNote } from './vaultService';
import { renderAsciidocOffThread } from './asciidocRenderClient';
import { groupFootnotesByChapter } from './footnoteRenderer';
import { resolveIncludes } from './includeResolver';
import { resolvePreviewImages } from './imageResolver';
import { sanitizeAsciidocHtml } from './sanitizeHtml';
import { rewriteWikilinksForRender } from './wikilinkService';

export interface RenderDocumentInput {
  content: string;
  currentPath: string | null;
  notes: VaultNote[];
  bibliography: BibliographyEntry[];
}

export interface RenderPipelineDependencies {
  resolveIncludes: typeof resolveIncludes;
  rewriteWikilinks: typeof rewriteWikilinksForRender;
  renderAsciidoc: typeof renderAsciidocOffThread;
  loadMathRenderer: () => Promise<typeof import('./mathRenderer').renderMathInHtml>;
  groupFootnotes: typeof groupFootnotesByChapter;
  sanitizeHtml: typeof sanitizeAsciidocHtml;
  resolveImages: typeof resolvePreviewImages;
}

const defaultDependencies: RenderPipelineDependencies = {
  resolveIncludes,
  rewriteWikilinks: rewriteWikilinksForRender,
  renderAsciidoc: renderAsciidocOffThread,
  loadMathRenderer: async () => (await import('./mathRenderer')).renderMathInHtml,
  groupFootnotes: groupFootnotesByChapter,
  sanitizeHtml: sanitizeAsciidocHtml,
  resolveImages: resolvePreviewImages,
};

/**
 * Functional orchestration of preview rendering. Browser/Tauri adapters are
 * injected at the boundary, so the ordering and safety transforms can be
 * tested without a worker, DOM, or filesystem.
 */
export async function renderDocumentPreview(
  input: RenderDocumentInput,
  dependencies: RenderPipelineDependencies = defaultDependencies,
): Promise<AsciidocRenderResult> {
  const expandedContent = await dependencies.resolveIncludes(input.content, input.currentPath);
  const contentWithWikilinks = dependencies.rewriteWikilinks(expandedContent, input.notes);
  const rendered = await dependencies.renderAsciidoc(contentWithWikilinks, input.bibliography);
  if (!rendered.safeDocument) {
    throw new Error('The AsciiDoc renderer did not return a normalized document model.');
  }
  const renderMath = await dependencies.loadMathRenderer();
  const htmlWithMath = renderMath(rendered.html);
  const htmlWithFootnotes = dependencies.groupFootnotes(htmlWithMath);
  const sanitizedHtml = dependencies.sanitizeHtml(htmlWithFootnotes);
  const htmlWithImages = await dependencies.resolveImages(sanitizedHtml, input.currentPath);

  return { ...rendered, html: htmlWithImages };
}
