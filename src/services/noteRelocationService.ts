import { mapAsciiDocProse } from './asciidocProse';
import { dirnameOf, isWithinRoot, resolveWithinRoot } from './pathSafety';
import { createWikilinkResolver } from './wikilinkService';
import type { VaultNote } from './vaultService';

export function relocatedPath(path: string, oldPath: string, newPath: string): string {
  return isWithinRoot(path, oldPath) ? newPath + path.slice(oldPath.length) : path;
}

function relativePath(from: string, to: string): string {
  const a = from.split('/');
  const b = to.split('/');
  while (a.length && b.length && a[0] === b[0]) {
    a.shift();
    b.shift();
  }
  return [...a.map(() => '..'), ...b].join('/');
}

export function relocateNoteReferences(
  note: VaultNote,
  notes: VaultNote[],
  root: string,
  oldPath: string,
  newPath: string,
  resolve = createWikilinkResolver(notes),
): string {
  const destination = relocatedPath(note.path, oldPath, newPath);
  const wikilinks = (text: string) =>
    text.replace(/\[\[([^\]|\r\n]+)(?:\|([^\]\r\n]+))?\]\]/g, (raw, target: string, alias?: string) => {
      const resolved = resolve(target);
      if (!resolved || !isWithinRoot(resolved.path, oldPath)) return raw;
      const path = relocatedPath(resolved.path, oldPath, newPath).slice(root.length + 1);
      return `[[${path}|${alias ?? target}]]`;
    });
  return mapAsciiDocProse(note.content, (text) =>
    wikilinks(text).replace(/\b(include::|image::?|xref:|link:)([^\s[]+)\[/g, (raw, prefix: string, target: string) => {
      if (/^[a-z]+:/i.test(target) || target.includes('{') || target.startsWith('#')) return raw;
      const [file, fragment] = target.split('#');
      const source = resolveWithinRoot(dirnameOf(note.path)!, file, root);
      if (!source) return raw;
      const moved = relocatedPath(source, oldPath, newPath);
      if (moved === source && destination === note.path) return raw;
      return `${prefix}${relativePath(dirnameOf(destination)!, moved)}${fragment === undefined ? '' : `#${fragment}`}[`;
    }),
  );
}

/** Build the lookup once for the entire move, rather than scanning the Vault per link. */
export function planNoteRelocation(notes: VaultNote[], root: string, oldPath: string, newPath: string) {
  const resolve = createWikilinkResolver(notes);
  return notes
    .map((note) => ({ note, content: relocateNoteReferences(note, notes, root, oldPath, newPath, resolve) }))
    .filter(({ note, content }) => content !== note.content);
}
