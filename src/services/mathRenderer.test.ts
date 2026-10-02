import { describe, it, expect } from 'vitest';
import { renderMathInHtml } from './mathRenderer';

describe('renderMathInHtml', () => {
  it('renders inline \\(...\\) math into a KaTeX span', () => {
    const out = renderMathInHtml('<p>Inline math: \\(x^2 + y^2 = z^2\\) end.</p>');

    expect(out).toContain('class="katex"');
    expect(out).not.toContain('\\(');
    expect(out).toContain('Inline math:');
    expect(out).toContain('end.');
  });

  it("renders a [stem] block's \\[...\\] content in display mode", () => {
    const out = renderMathInHtml(
      '<div class="stemblock"><div class="content">\\[\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}\\]</div></div>',
    );

    expect(out).toContain('katex-display');
  });

  it('does not touch math-like text inside code blocks', () => {
    const out = renderMathInHtml('<pre><code>\\(this should not render\\)</code></pre>');

    expect(out).toContain('\\(this should not render\\)');
    expect(out).not.toContain('katex');
  });

  it('returns plain HTML unchanged when there is no math', () => {
    const html = '<p>Just a normal paragraph.</p>';
    expect(renderMathInHtml(html)).toBe(html);
  });

  it('handles multiple inline formulas in the same text node', () => {
    const out = renderMathInHtml('<p>\\(a+b\\) and \\(c+d\\) and text after.</p>');

    expect((out.match(/class="katex"/g) || []).length).toBe(2);
    expect(out).toContain('and text after.');
  });

  it('numbers display equations in document order', () => {
    const html = `
      <div id="eq-a" class="stemblock"><div class="content">\\[a\\]</div></div>
      <div id="eq-b" class="stemblock"><div class="content">\\[b\\]</div></div>
    `;
    const out = renderMathInHtml(html);

    const numbers = Array.from(out.matchAll(/class="equation-number">(\([0-9]+\))</g)).map((m) => m[1]);
    expect(numbers).toEqual(['(1)', '(2)']);
  });

  it("resolves an unlabeled <<eq-id>> xref to the equation's number", () => {
    const html = `
      <p>See <a href="#eq-b">[eq-b]</a>.</p>
      <div id="eq-a" class="stemblock"><div class="content">\\[a\\]</div></div>
      <div id="eq-b" class="stemblock"><div class="content">\\[b\\]</div></div>
    `;
    const out = renderMathInHtml(html);

    expect(out).toContain('<a href="#eq-b">(2)</a>');
  });

  it('leaves an explicit custom xref label untouched', () => {
    const html = `
      <p>See <a href="#eq-a">the Pythagorean identity</a>.</p>
      <div id="eq-a" class="stemblock"><div class="content">\\[a\\]</div></div>
    `;
    const out = renderMathInHtml(html);

    expect(out).toContain('<a href="#eq-a">the Pythagorean identity</a>');
  });

  it('numbers equations without an id but does not make them referenceable', () => {
    const html = `
      <div class="stemblock"><div class="content">\\[a\\]</div></div>
      <p><a href="#eq-a">[eq-a]</a></p>
    `;
    const out = renderMathInHtml(html);

    expect(out).toContain('(1)');
    // no equation has id="eq-a", so this xref must stay unresolved
    expect(out).toContain('<a href="#eq-a">[eq-a]</a>');
  });
});
