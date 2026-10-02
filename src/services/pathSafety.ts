/**
 * Normalizes a POSIX-style path by collapsing `.`/`..` segments, without
 * touching the filesystem. `..` at the root is a no-op rather than going
 * negative (mirrors how most path.normalize implementations behave).
 */
export function normalizePath(path: string): string {
  const isAbsolute = path.startsWith('/');
  const stack: string[] = [];
  for (const part of path.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') {
      if (stack.length > 0 && stack[stack.length - 1] !== '..') {
        stack.pop();
      } else if (!isAbsolute) {
        stack.push('..');
      }
      continue;
    }
    stack.push(part);
  }
  return (isAbsolute ? '/' : '') + stack.join('/');
}

/**
 * Resolves `relativePath` against `baseDir`, but only if the result stays
 * inside `rootDir`. Returns null otherwise.
 *
 * AsciiDoc's `include::` and `image::` directives take a path straight from
 * the document text, which - if the document itself came from somewhere
 * untrusted (an email attachment, a downloaded file) - is not something we
 * should let read arbitrary files off disk. Bounding resolution to the
 * open document's own folder (and its subfolders) allows every real use
 * case (multi-chapter books split into files, an `images/` subfolder) while
 * blocking `include::../../../../etc/passwd[]`-style escapes.
 */
export function resolveWithinRoot(baseDir: string, relativePath: string, rootDir: string): string | null {
  const combined = relativePath.startsWith('/') ? relativePath : `${baseDir}/${relativePath}`;
  const normalized = normalizePath(combined);
  return isWithinRoot(normalized, rootDir) ? normalized : null;
}

/** Whether `path` is `rootDir` itself or one of its descendants, after
 * lexical normalization. This is filesystem-free by design: callers use it
 * for UI decisions, while native code canonicalizes paths before opening. */
export function isWithinRoot(path: string, rootDir: string): boolean {
  const normalizedPath = normalizePath(path);
  const normalizedRoot = normalizePath(rootDir);
  return normalizedRoot === '/'
    ? normalizedPath.startsWith('/')
    : normalizedPath === normalizedRoot || normalizedPath.startsWith(`${normalizedRoot}/`);
}

/** Directory portion of a path, or null if it has no `/`. */
export function dirnameOf(path: string): string | null {
  const lastSlash = path.lastIndexOf('/');
  return lastSlash === -1 ? null : path.substring(0, lastSlash);
}

/** Final "/"-delimited segment of a path (the file/folder's own name). */
export function basenameOf(path: string): string {
  const lastSlash = path.lastIndexOf('/');
  return lastSlash === -1 ? path : path.substring(lastSlash + 1);
}

/** Directory entries no folder-walk in this app should ever descend into or
 * list - dependency/build/VCS folders and OS noise a user's document folder
 * routinely has sitting alongside their actual notes. Shared by
 * fileTreeService's (single-level, lazy) listing and vaultService's
 * (recursive, eager) vault index so the two can't drift apart. */
export const IGNORED_DIR_ENTRY_NAMES = new Set([
  '.asciidoc-trash',
  'node_modules',
  '.git',
  'dist',
  'target',
  '.DS_Store',
  '.asciidoc-studio',
]);
