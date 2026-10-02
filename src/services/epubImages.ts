import { readFile } from '@tauri-apps/plugin-fs';
import { dirnameOf, resolveWithinRoot } from './pathSafety';
import { IMAGE_MIME_TYPES, extensionOf } from './imageMimeTypes';

export interface EpubImageAsset {
  filename: string;
  mediaType: string;
  data: Uint8Array;
}

function isExternalOrEmbedded(src: string): boolean {
  return /^(https?:|data:)/i.test(src);
}

async function loadImageAsset(resolvedPath: string, index: number): Promise<EpubImageAsset | null> {
  const ext = extensionOf(resolvedPath);
  const mediaType = IMAGE_MIME_TYPES[ext];
  if (!mediaType) {
    console.warn(`Skipping image "${resolvedPath}": unsupported extension for EPUB.`);
    return null;
  }
  try {
    const data = await readFile(resolvedPath);
    return { filename: `img-${index}.${ext}`, mediaType, data };
  } catch (err) {
    console.warn(`Skipping image "${resolvedPath}": failed to read file.`, err);
    return null;
  }
}

/**
 * Resolves a single <img src="..."> to its bundled EPUB filename, reading and
 * registering the asset the first time a given path is seen. Returns null for
 * anything that can't or shouldn't be bundled (external/inline sources, an
 * unsaved document, an unsupported extension, or a file that failed to read) -
 * each case already logs its own console.warn at the point it's decided.
 */
async function resolveAssetFilename(
  src: string,
  baseDir: string | null,
  resolvedToFilename: Map<string, string>,
  assets: EpubImageAsset[],
): Promise<string | null> {
  if (isExternalOrEmbedded(src)) return null;
  if (!baseDir) {
    console.warn(`Skipping image "${src}": save the document first so its path can be resolved.`);
    return null;
  }

  // Bounded to the document's own folder (and subfolders) - see pathSafety.ts.
  // Without this, an `image::../../../../etc/passwd[]` (or any absolute path)
  // in the document text would get read and bundled straight into the EPUB.
  const resolvedPath = resolveWithinRoot(baseDir, src, baseDir);
  if (!resolvedPath) {
    console.warn(`Refusing to bundle image "${src}": resolves outside the document's folder.`);
    return null;
  }

  const cached = resolvedToFilename.get(resolvedPath);
  if (cached) return cached;

  const asset = await loadImageAsset(resolvedPath, assets.length);
  if (!asset) return null;

  resolvedToFilename.set(resolvedPath, asset.filename);
  assets.push(asset);
  return asset.filename;
}

/**
 * Rewrites <img src="..."> references in a chapter's HTML to point at bundled
 * EPUB assets (images/<name>), reading each referenced file from disk relative
 * to the source .adoc file. Already-seen paths are deduped via `resolvedToFilename`
 * so the same image referenced from multiple chapters is only read/added once.
 */
async function inlineChapterImages(
  html: string,
  baseDir: string | null,
  resolvedToFilename: Map<string, string>,
  assets: EpubImageAsset[],
): Promise<string> {
  const doc = new DOMParser().parseFromString(html, 'text/html');

  for (const img of Array.from(doc.querySelectorAll('img'))) {
    const src = img.getAttribute('src');
    if (!src) continue;

    const filename = await resolveAssetFilename(src, baseDir, resolvedToFilename, assets);
    if (filename) img.setAttribute('src', `images/${filename}`);
  }

  return doc.body.innerHTML;
}

/**
 * Bundles local images referenced by <img> tags across all chapters.
 * `docPath` is the source .adoc file's path (or null if the document was
 * never saved, in which case relative image paths can't be resolved).
 */
export async function bundleChapterImages<T extends { bodyHtml: string }>(
  chapters: T[],
  docPath: string | null,
): Promise<{ chapters: T[]; assets: EpubImageAsset[] }> {
  const baseDir = docPath ? dirnameOf(docPath) : null;
  const resolvedToFilename = new Map<string, string>();
  const assets: EpubImageAsset[] = [];

  const processedChapters: T[] = [];
  for (const chapter of chapters) {
    processedChapters.push({
      ...chapter,
      bodyHtml: await inlineChapterImages(chapter.bodyHtml, baseDir, resolvedToFilename, assets),
    });
  }

  return { chapters: processedChapters, assets };
}
