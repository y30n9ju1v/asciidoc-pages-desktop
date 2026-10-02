import { readFile } from '@tauri-apps/plugin-fs';
import { dirnameOf, resolveWithinRoot } from './pathSafety';
import { IMAGE_MIME_TYPES, extensionOf } from './imageMimeTypes';

export interface CoverImage {
  filename: string;
  mediaType: string;
  data: Uint8Array;
}

/**
 * Resolves and reads a cover image declared via AsciiDoc's `:front-cover-image:`/
 * `:back-cover-image:` document attributes. Bounded to the open document's own
 * folder (and subfolders) via resolveWithinRoot - same rule as body images, see
 * pathSafety.ts - so a `:front-cover-image: ../../../../etc/passwd` can't read
 * arbitrary files off disk.
 */
export async function loadCoverImage(attributeValue: unknown, currentPath: string | null): Promise<CoverImage | null> {
  if (typeof attributeValue !== 'string' || !attributeValue.trim()) return null;

  if (!currentPath) {
    console.warn(`Skipping cover image "${attributeValue}": save the document first so its path can be resolved.`);
    return null;
  }

  const rootDir = dirnameOf(currentPath);
  if (!rootDir) return null;

  const resolvedPath = resolveWithinRoot(rootDir, attributeValue, rootDir);
  if (!resolvedPath) {
    console.warn(`Refusing to load cover image "${attributeValue}": resolves outside the document's folder.`);
    return null;
  }

  const ext = extensionOf(resolvedPath);
  const mediaType = IMAGE_MIME_TYPES[ext];
  if (!mediaType) {
    console.warn(`Skipping cover image "${attributeValue}": unsupported extension for publishing.`);
    return null;
  }

  try {
    const data = await readFile(resolvedPath);
    return { filename: resolvedPath.split('/').pop() ?? `cover.${ext}`, mediaType, data };
  } catch (err) {
    console.warn(`Skipping cover image "${attributeValue}": failed to read file.`, err);
    return null;
  }
}

export function coverImageToDataUri(image: CoverImage): string {
  let binary = '';
  for (let i = 0; i < image.data.byteLength; i++) {
    binary += String.fromCharCode(image.data[i]);
  }
  return `data:${image.mediaType};base64,${btoa(binary)}`;
}
