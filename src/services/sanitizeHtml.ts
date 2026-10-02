import DOMPurify from 'dompurify';

// Defense in depth against AsciiDoc passthrough macros (`pass:[...]`, `+++...+++`)
// that can embed raw HTML/script into the converted document. The CSP's
// `script-src 'self'` already blocks injected <script> tags and inline event
// handlers from executing, but we sanitize here too so the preview DOM never
// contains them in the first place (and so this holds even if CSP is ever relaxed).
// DOMPurify covers considerably more ground than a hand-rolled <script>/on*-attribute
// strip - SVG/MathML-based vectors, CSS injection, mutation XSS from DOM round-trips
// (which sanitizeAsciidocHtml itself does), and URL-encoding bypasses.
export function sanitizeAsciidocHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    // "wikilink" is this app's own scheme for [[wikilink]] anchors (see
    // wikilinkService.ts) - never actually navigated to, LivePreview
    // intercepts clicks on it instead, but DOMPurify would otherwise strip
    // the href outright as an unrecognized scheme. Deliberately exclude
    // `file:`: exported HTML must never turn document-controlled markup into
    // arbitrary disk reads when someone opens it in a browser.
    ALLOWED_URI_REGEXP:
      /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|cid|xmpp|data|asset|wikilink):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
  });
}
