import { describe, it, expect } from 'vitest';
import { highlightCodeBlocks } from './codeHighlighter';

describe('highlightCodeBlocks', () => {
  it('applies highlight.js spans to a regular code block', () => {
    const container = document.createElement('div');
    container.innerHTML = '<pre class="highlight"><code class="language-js">const x = 1;</code></pre>';

    highlightCodeBlocks(container);

    const code = container.querySelector('code')!;
    expect(code.classList.contains('hljs')).toBe(true);
    expect(code.querySelectorAll('span').length).toBeGreaterThan(0);
  });

  it('does not touch Mermaid code blocks', () => {
    const container = document.createElement('div');
    container.innerHTML =
      '<pre class="mermaid language-mermaid"><code class="language-mermaid">flowchart TD</code></pre>';

    highlightCodeBlocks(container);

    const code = container.querySelector('code')!;
    expect(code.classList.contains('hljs')).toBe(false);
    expect(code.textContent).toBe('flowchart TD');
  });
});
