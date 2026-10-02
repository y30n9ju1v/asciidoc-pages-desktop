import { describe, it, expect } from 'vitest';
import { buildPageRuleCss, buildCoverPageHtml } from './printLayout';

describe('buildPageRuleCss', () => {
  it('embeds the page size dimensions and margin for the given page size', () => {
    const css = buildPageRuleCss('B5');
    expect(css).toContain('size: 182mm 257mm;');
    expect(css).toContain('margin: 15mm 15mm 18mm 15mm;');
  });

  it('includes the page-number counter and cover-page rules', () => {
    const css = buildPageRuleCss('A4');
    expect(css).toContain('content: counter(page) " / " counter(pages);');
    expect(css).toContain('.cover-page {');
    expect(css).toContain('.cover-page.back-cover-page {');
  });
});

describe('buildCoverPageHtml', () => {
  it('renders an <img> wrapped in a cover-page div when a data URI is given', () => {
    const html = buildCoverPageHtml('data:image/png;base64,AAA=', 'front-cover-page');
    expect(html).toContain('class="cover-page front-cover-page"');
    expect(html).toContain('src="data:image/png;base64,AAA="');
  });

  it('returns an empty string when there is no cover image', () => {
    expect(buildCoverPageHtml(null, 'front-cover-page')).toBe('');
  });
});
