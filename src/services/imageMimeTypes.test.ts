import { describe, it, expect } from 'vitest';
import { IMAGE_MIME_TYPES, extensionOf } from './imageMimeTypes';

describe('extensionOf', () => {
  it('returns the lowercased extension', () => {
    expect(extensionOf('/foo/bar/Cover.JPG')).toBe('jpg');
    expect(extensionOf('images/pic.png')).toBe('png');
  });

  it('returns an empty string when there is no extension', () => {
    expect(extensionOf('no-extension')).toBe('no-extension');
  });
});

describe('IMAGE_MIME_TYPES', () => {
  it('covers the common raster/vector image formats', () => {
    expect(IMAGE_MIME_TYPES.png).toBe('image/png');
    expect(IMAGE_MIME_TYPES.jpg).toBe('image/jpeg');
    expect(IMAGE_MIME_TYPES.jpeg).toBe('image/jpeg');
    expect(IMAGE_MIME_TYPES.gif).toBe('image/gif');
    expect(IMAGE_MIME_TYPES.svg).toBe('image/svg+xml');
    expect(IMAGE_MIME_TYPES.webp).toBe('image/webp');
  });
});
