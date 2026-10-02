import hljs from 'highlight.js';

/**
 * Applies highlight.js syntax highlighting to every code block inside `container`,
 * skipping Mermaid blocks (those are handled separately by mermaidRenderer.ts).
 * Shared by the live preview and HTML exporter so exported code blocks come out
 * the same as what's shown on screen, rather than as plain unstyled text.
 */
export function highlightCodeBlocks(container: HTMLElement): void {
  const codeBlocks = container.querySelectorAll<HTMLElement>(
    'pre.highlight code, pre.listingblock code, code[class*="language-"]',
  );

  codeBlocks.forEach((block) => {
    if (block.classList.contains('language-mermaid') || block.classList.contains('mermaid')) {
      return;
    }
    try {
      delete block.dataset.highlighted;
      hljs.highlightElement(block);
    } catch (err) {
      console.warn('Highlight.js error:', err);
    }
  });
}
