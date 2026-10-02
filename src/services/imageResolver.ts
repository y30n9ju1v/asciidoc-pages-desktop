import { convertFileSrc } from '@tauri-apps/api/core';
import { readFile } from '@tauri-apps/plugin-fs';
import { dirnameOf, resolveWithinRoot } from './pathSafety';
import { IMAGE_MIME_TYPES, extensionOf } from './imageMimeTypes';

function bufferToBase64(buffer: Uint8Array): string {
  let binary = '';
  const len = buffer.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(buffer[i]);
  }
  return btoa(binary);
}

interface ImgTagMatch {
  fullMatch: string;
  prefix: string;
  src: string;
  suffix: string;
}

function parseImgTags(html: string): ImgTagMatch[] {
  const imgTagRegex = /<img\s+([^>]*?)src=["']([^"']+)["']([^>]*?)>/gi;
  const matches: ImgTagMatch[] = [];

  let match: RegExpExecArray | null;
  while ((match = imgTagRegex.exec(html)) !== null) {
    matches.push({ fullMatch: match[0], prefix: match[1], src: match[2], suffix: match[3] });
  }

  return matches;
}

function isRemoteOrDataSrc(src: string): boolean {
  return src.startsWith('http://') || src.startsWith('https://') || src.startsWith('data:');
}

/** Reads the target file and returns a `data:` URI, or null if it can't be read locally. */
async function loadAsDataUri(targetPath: string): Promise<string | null> {
  try {
    const fileBytes = await readFile(targetPath);
    const base64 = bufferToBase64(fileBytes);
    const mimeType = IMAGE_MIME_TYPES[extensionOf(targetPath)] ?? 'image/jpeg';
    return `data:${mimeType};base64,${base64}`;
  } catch {
    return null;
  }
}

/** Resolves a single <img> match to its replacement src, or null if it should be left untouched. */
async function resolveImgSrc(src: string, rootDir: string | null): Promise<string | null> {
  if (isRemoteOrDataSrc(src) || !rootDir) return null;

  const targetPath = resolveWithinRoot(rootDir, src, rootDir);
  if (!targetPath) {
    console.warn(`Refusing to load image "${src}": resolves outside the document's folder.`);
    return null;
  }

  const dataUri = await loadAsDataUri(targetPath);
  if (dataUri) return dataUri;

  try {
    return convertFileSrc(targetPath);
  } catch (err) {
    console.warn(`[imageResolver] Failed fallback convertFileSrc for ${src}`, err);
    return null;
  }
}

/**
 * Resolves relative <img src="..."> in generated AsciiDoc HTML to Base64 Data URIs or Tauri Asset URLs.
 *
 * Resolution is bounded to the open document's own folder (and its
 * subfolders) via resolveWithinRoot - see pathSafety.ts. Without that, an
 * `image::/etc/passwd[]` (or any absolute path) in the document text would
 * get read and base64-embedded into the preview/exported output verbatim.
 */
export async function resolvePreviewImages(html: string, currentPath: string | null): Promise<string> {
  if (!html) return html;

  const matches = parseImgTags(html);
  if (matches.length === 0) return html;

  const rootDir = currentPath ? dirnameOf(currentPath) : null;
  let resolvedHtml = html;

  for (const m of matches) {
    const newSrc = await resolveImgSrc(m.src, rootDir);
    if (!newSrc) continue;

    const newImgTag = `<img ${m.prefix}src="${newSrc}"${m.suffix}>`;
    resolvedHtml = resolvedHtml.replace(m.fullMatch, newImgTag);
  }

  return resolvedHtml;
}
