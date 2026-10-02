import type { AsciidocRenderResult } from './asciidocService';
import type { BibliographyEntry } from './bibliographyService';

async function renderOnMainThread(content: string, bibliography: BibliographyEntry[]): Promise<AsciidocRenderResult> {
  const { renderAsciidoc } = await import('./asciidocService');
  return renderAsciidoc(content, bibliography);
}

export async function renderAsciidocOffThread(
  content: string,
  bibliography: BibliographyEntry[] = [],
): Promise<AsciidocRenderResult> {
  // WebKit can start a module Worker yet never return this WASM renderer's
  // structured result. This desktop app already debounces rendering, so a
  // direct async conversion is the reliable boundary for preview and PDF.
  return renderOnMainThread(content, bibliography);
}
