import { renderMermaidBlocks } from './mermaidRenderer';
import { highlightCodeBlocks } from './codeHighlighter';
import { ThemeInput } from './themeService';

/**
 * Applies the same highlight.js syntax coloring + Mermaid-to-SVG rendering that
 * the live preview does directly against the browser DOM (LivePreview.tsx) -
 * neither of which is ever written back into renderResult.html. Any output path
 * that consumes renderResult.html as a plain string outside of LivePreview.tsx
 * (HTML, EPUB, Paged.js pagination preview) needs this first, or it shows raw
 * Mermaid source text and unstyled code blocks instead of what's on screen.
 */
export async function prerenderForStaticOutput(html: string, themeId: ThemeInput): Promise<string> {
  const container = document.createElement('div');
  container.innerHTML = html;
  highlightCodeBlocks(container);
  await renderMermaidBlocks(container, themeId);
  return container.innerHTML;
}
