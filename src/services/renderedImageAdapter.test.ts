import { describe, expect, it } from 'vitest';
import { collectRenderedImages } from './renderedImageAdapter';

describe('collectRenderedImages', () => {
  it('extracts only image sources and alt attributes from rendered HTML', () => {
    expect(collectRenderedImages('<img src="cover.png" alt="Cover"><img src="diagram.svg">')).toEqual([
      { src: 'cover.png', alt: 'Cover' },
      { src: 'diagram.svg', alt: null },
    ]);
  });
});
