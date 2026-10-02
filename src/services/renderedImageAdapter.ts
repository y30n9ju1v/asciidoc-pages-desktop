import type { RenderedImage } from './preflightService';

/** Browser/DOM boundary that extracts only the image facts needed by publication policy. */
export function collectRenderedImages(html: string): RenderedImage[] {
  const container = document.createElement('div');
  container.innerHTML = html;

  return Array.from(container.querySelectorAll('img')).map((image) => ({
    src: image.getAttribute('src') ?? '',
    alt: image.getAttribute('alt'),
  }));
}
