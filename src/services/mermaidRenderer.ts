import mermaid from 'mermaid';
import { ThemeInput, getMermaidThemeConfig } from './themeService';

let mermaidIdCounter = 0;

function formatCustomWidth(customWidth: string): string {
  return customWidth.endsWith('%') || customWidth.endsWith('px') || customWidth.endsWith('pt')
    ? customWidth
    : `${customWidth}px`;
}

function buildMermaidWrapper(svg: string, customWidth: string | null): HTMLDivElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'mermaid-diagram-wrapper';
  wrapper.style.display = 'flex';
  wrapper.style.justifyContent = 'center';
  wrapper.style.margin = '20px auto';
  wrapper.style.overflowX = 'auto';
  wrapper.style.maxWidth = '100%';
  wrapper.innerHTML = svg;

  const svgEl = wrapper.querySelector<SVGElement>('svg');
  if (svgEl) {
    svgEl.style.maxWidth = '100%';
    svgEl.style.height = 'auto';
    // Flex items default to min-width: auto, which for a replaced element
    // (this <svg>, sized by Mermaid's own width/height attributes) resolves
    // to its intrinsic width - that fights max-width: 100% and stops it
    // shrinking below its rendered size, so narrowing the preview pane
    // overflows the diagram (clipped behind the wrapper's overflow-x:
    // auto scrollbar) instead of scaling it down. min-width: 0 opts back
    // into normal shrink-to-fit sizing.
    svgEl.style.minWidth = '0';
    if (customWidth) {
      const formattedWidth = formatCustomWidth(customWidth);
      svgEl.style.width = formattedWidth;
      wrapper.style.width = formattedWidth;
    }
  }

  return wrapper;
}

function diagramSource(target: HTMLElement): string | null {
  if (target.closest('.mermaid-diagram-wrapper')) return null;
  return target.textContent?.trim() || null;
}

function diagramWidth(target: HTMLElement): string | null {
  const listing = target.closest('.listingblock') || target;
  return listing.getAttribute('width') || target.getAttribute('width') || listing.getAttribute('data-width');
}

async function renderSvg(id: string, code: string): Promise<string | null> {
  try {
    const { svg } = await mermaid.render(id, code);
    return svg;
  } catch (err) {
    // Suppress transient syntax errors while user is actively typing
    console.warn('Mermaid rendering syntax error:', err);
    document.getElementById(id)?.remove();
    return null;
  }
}

async function renderMermaidTarget(target: HTMLElement, isCancelled: () => boolean): Promise<void> {
  const code = diagramSource(target);
  if (!code) return;

  const id = `mermaid-svg-${mermaidIdCounter++}`;
  const svg = await renderSvg(id, code);
  if (!svg || isCancelled()) return;

  const parentListing = target.closest('.listingblock') || target;
  parentListing.replaceWith(buildMermaidWrapper(svg, diagramWidth(target)));
}

// Shared by renderMermaidBlocks and renderMermaidToSvgString so both call
// mermaid.initialize with the exact same security settings - see
// renderMermaidBlocks's own comment for why 'strict' matters here.
function initializeMermaid(themeId: ThemeInput): void {
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    ...getMermaidThemeConfig(themeId),
  });
}

/**
 * Renders a single Mermaid diagram source to a raw SVG string, with no DOM
 * wrapper - used by the PDF pipeline (pdfPublicationRequest.ts), which needs
 * SVG bytes as an embeddable Typst image asset rather than an HTML fragment.
 * Still requires a real browser layout engine (mermaid.render() does, same
 * as renderMermaidBlocks), so this only ever runs on the frontend, never in
 * the Rust PDF compiler.
 */
export async function renderMermaidToSvgString(code: string, themeId: ThemeInput): Promise<string | null> {
  initializeMermaid(themeId);
  return renderSvg(`mermaid-svg-${mermaidIdCounter++}`, code);
}

/**
 * Finds every Mermaid code block inside `container` and replaces it in place with
 * a rendered SVG wrapper (custom `width=` attributes on the source block are
 * honored). Shared by the live preview and the EPUB exporter so both apply the
 * exact same security setting: `securityLevel: 'strict'`, since diagram source is
 * document content (not necessarily trustworthy) - 'loose' would let diagram
 * labels carry raw HTML/click-handlers, reopening the same passthrough-macro XSS
 * vector sanitizeAsciidocHtml exists to close. `mermaid.initialize` is global,
 * mutable module state; routing every call site (including the PDF pipeline's
 * renderMermaidToSvgString) through the shared initializeMermaid() means they
 * can't drift onto different security levels, and since both always request
 * 'strict' regardless of caller, the two racing is harmless either way.
 */
export async function renderMermaidBlocks(
  container: HTMLElement,
  themeId: ThemeInput,
  isCancelled: () => boolean = () => false,
): Promise<void> {
  const targets = container.querySelectorAll<HTMLElement>(
    'code.language-mermaid, pre.language-mermaid, pre.mermaid, .mermaid',
  );
  if (targets.length === 0) return;

  initializeMermaid(themeId);

  for (const target of Array.from(targets)) {
    if (isCancelled()) return;
    await renderMermaidTarget(target, isCancelled);
  }
}
