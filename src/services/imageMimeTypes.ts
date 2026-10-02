// Single source of truth for "file extension -> image MIME type", shared by every
// place that reads a local image off disk (preview, EPUB bundling, cover images).
// Previously each had its own copy of this map, which is exactly the kind of thing
// that quietly drifts (e.g. a new extension added to only one of them).
export const IMAGE_MIME_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  webp: 'image/webp',
};

export function extensionOf(path: string): string {
  return path.split('.').pop()?.toLowerCase() ?? '';
}
