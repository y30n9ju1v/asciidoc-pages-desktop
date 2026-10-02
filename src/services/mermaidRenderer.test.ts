import { describe, expect, it, vi } from 'vitest';

vi.mock('mermaid', () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn(async (id: string) => ({
      svg: `<svg id="${id}" width="815" height="400" viewBox="0 0 815 400"></svg>`,
    })),
  },
}));

import { renderMermaidBlocks } from './mermaidRenderer';

describe('renderMermaidBlocks', () => {
  it('sets min-width: 0 on the rendered svg so it can shrink below its intrinsic size inside the flex wrapper', async () => {
    // The wrapper is display:flex, and a flex item's default min-width:auto
    // resolves to a replaced element's intrinsic size - without an explicit
    // min-width: 0 override, that fights max-width: 100% and stops the
    // diagram scaling down when the live preview pane is narrowed (it
    // overflows instead of shrinking). This is the regression this test
    // guards.
    const container = document.createElement('div');
    container.innerHTML = '<pre class="mermaid">graph TD\nA --> B</pre>';

    await renderMermaidBlocks(container, 'book-serif');

    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg?.style.minWidth).toBe('0px');
    expect(svg?.style.maxWidth).toBe('100%');
  });
});
