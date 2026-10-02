import katex from 'katex';

// Asciidoctor emits stem content as raw LaTeX wrapped in MathJax-style delimiters
// rather than pre-rendering it: `\( ... \)` for inline stem:[...] macros (as plain
// text, no wrapping element) and `\[ ... \]` inside `.stemblock .content` for
// [stem] blocks. There's no built-in renderer for these on the AsciiDoc Studio
// side, so without this pass they show up as literal backslash-escaped text.
// `stem: 'latexmath'` in asciidocService.ts's DEFAULT_ATTRIBUTES ensures both
// forms always use LaTeX (not AsciiMath) delimiters, which is all KaTeX understands.
const INLINE_MATH_RE = /\\\((.+?)\\\)/g;

function renderTex(tex: string, displayMode: boolean): string {
  try {
    return katex.renderToString(tex, { throwOnError: false, displayMode });
  } catch (err) {
    console.warn('KaTeX render error:', err);
    return tex;
  }
}

/**
 * Numbers every display equation ([stem] block) in document order - "(1)", "(2)", ... -
 * and appends the label into the block itself (styled via CSS as a flex row so it
 * sits to the right of the equation, book-margin style). Asciidoctor has no
 * built-in caption/numbering for stem blocks (unlike figures/tables, which get
 * "Figure N"/"Table N" automatically), so an unresolved `<<eq-id>>` xref to one
 * renders as literal `[eq-id]` text - this rewrites those to "(N)" too, but only
 * when the author didn't supply their own link text (`<<eq-id,custom text>>`),
 * matching how Asciidoctor's own figure/table xref resolution behaves.
 */
function numberEquationsAndResolveXrefs(doc: Document): void {
  const blocks = Array.from(doc.querySelectorAll<HTMLElement>('.stemblock'));
  if (blocks.length === 0) return;

  const idToNumber = new Map<string, number>();

  blocks.forEach((block, index) => {
    const number = index + 1;
    if (block.id) idToNumber.set(block.id, number);

    const label = doc.createElement('span');
    label.className = 'equation-number';
    label.textContent = `(${number})`;
    block.appendChild(label);
  });

  doc.querySelectorAll<HTMLAnchorElement>('a[href^="#"]').forEach((link) => {
    const targetId = link.getAttribute('href')!.slice(1);
    const number = idToNumber.get(targetId);
    if (number !== undefined && link.textContent === `[${targetId}]`) {
      link.textContent = `(${number})`;
    }
  });
}

export function renderMathInHtml(html: string): string {
  if (!html.includes('\\(') && !html.includes('\\[') && !html.includes('stemblock')) {
    return html;
  }

  const doc = new DOMParser().parseFromString(html, 'text/html');

  doc.querySelectorAll('.stemblock .content').forEach((el) => {
    const raw = (el.textContent ?? '').trim().replace(/^\\\[|\\\]$/g, '');
    el.innerHTML = renderTex(raw, true);
  });

  numberEquationsAndResolveXrefs(doc);

  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const text = node as Text;
    if (!text.data.includes('\\(')) continue;
    if (text.parentElement?.closest('pre, code, .stemblock')) continue;
    textNodes.push(text);
  }

  for (const textNode of textNodes) {
    const parts = textNode.data.split(INLINE_MATH_RE);
    // Odd indices are the captured tex source (from the split's capture group).
    if (parts.length === 1) continue;

    const frag = doc.createDocumentFragment();
    parts.forEach((part, i) => {
      if (i % 2 === 1) {
        const span = doc.createElement('span');
        span.innerHTML = renderTex(part, false);
        frag.appendChild(span);
      } else if (part) {
        frag.appendChild(doc.createTextNode(part));
      }
    });
    textNode.replaceWith(frag);
  }

  return doc.body.innerHTML;
}
