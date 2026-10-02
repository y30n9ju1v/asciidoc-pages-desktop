import { describe, it, expect } from 'vitest';
import { sanitizeAsciidocHtml } from './sanitizeHtml';

describe('sanitizeAsciidocHtml', () => {
  it('strips <script> tags injected via a passthrough macro', () => {
    const out = sanitizeAsciidocHtml('<p>hello</p><script>alert(1)</script>');
    expect(out).not.toContain('<script');
    expect(out).toContain('hello');
  });

  it('strips inline event handler attributes', () => {
    const out = sanitizeAsciidocHtml('<img src="x.png" onerror="alert(1)">');
    expect(out).not.toContain('onerror');
  });

  it('strips javascript: URLs', () => {
    const out = sanitizeAsciidocHtml('<a href="javascript:alert(1)">click</a>');
    expect(out).not.toContain('javascript:');
  });

  it('strips file URLs so exported HTML cannot reach arbitrary local files', () => {
    const out = sanitizeAsciidocHtml('<img src="file:///Users/alice/.ssh/id_rsa">');
    expect(out).not.toContain('file:');
  });

  it('keeps ordinary content, formatting, and safe links untouched', () => {
    const html = '<p><strong>Bold</strong> and <a href="https://example.com">a link</a>.</p>';
    const out = sanitizeAsciidocHtml(html);
    expect(out).toContain('<strong>Bold</strong>');
    expect(out).toContain('href="https://example.com"');
  });

  it('keeps asset:// and data: URIs used for local images', () => {
    const html = '<img src="asset://localhost/foo.png"><img src="data:image/png;base64,AAA=">';
    const out = sanitizeAsciidocHtml(html);
    expect(out).toContain('asset://localhost/foo.png');
    expect(out).toContain('data:image/png;base64,AAA=');
  });
});
