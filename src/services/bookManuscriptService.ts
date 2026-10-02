import type { BookProject } from './bookProjectService';
import type { VaultNote } from './vaultService';
import { dirnameOf, isWithinRoot, resolveWithinRoot } from './pathSafety';
import { mapAsciiDocProse } from './asciidocProse';

function singleLine(value: string): string {
  return value.replace(/[\r\n]/g, ' ');
}

function chapterSource(note: VaultNote, root: string): string {
  if (!isWithinRoot(note.path, root)) throw new Error(`Chapter outside Vault: ${note.path}`);
  let content = note.content;
  if (/^= /.test(content)) {
    content = content.replace(/^= ([^\n]*)\n(?:(?::[^\n]*|[^=\n][^\n]*)\n)*?\n/, '= $1\n\n');
    content = mapAsciiDocProse(content, (text) => text.replace(/^(={1,5}) /gm, '$1= '));
  }
  return mapAsciiDocProse(content, (text) =>
    text.replace(/\b(image::?|include::)([^\s[]+)\[/g, (raw, prefix: string, target: string) => {
      if (/^[a-z]+:/i.test(target)) return raw;
      if (target.includes('{'))
        throw new Error(`Expand path attributes in chapter ${note.title} before assembling the book.`);
      const path = resolveWithinRoot(dirnameOf(note.path)!, target, root);
      if (!path) throw new Error(`Asset outside Vault: ${target}`);
      return `${prefix}${path.slice(root.length + 1)}[`;
    }),
  );
}

/** Snapshot assembly follows the workspace order; source notes remain untouched. */
export function buildBookManuscript(project: BookProject, notes: VaultNote[], root: string): string {
  if (!project.chapters.length) throw new Error('Add chapters to the book first.');
  const byPath = new Map(notes.map((note) => [note.path, note]));
  const chapters = project.chapters.map((chapter) => {
    const note = byPath.get(chapter.path);
    if (!note) throw new Error(`Missing chapter: ${chapter.path}`);
    return chapterSource(note, root);
  });
  return `= ${singleLine(project.metadata.title)}\n:author: ${singleLine(project.metadata.author)}\n:lang: ${singleLine(project.metadata.language)}\n:doctype: book\n:toc:\n\n${chapters.join('\n\n')}\n`;
}
