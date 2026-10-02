import { readDocumentText, writeDocumentText } from './documentFileAdapter';
import type { BookProject } from './bookProjectService';
import { buildBookManuscript } from './bookManuscriptService';
import { basenameOf, isWithinRoot } from './pathSafety';

export async function assembleBookFromFiles(project: BookProject, root: string): Promise<string> {
  const notes = [];
  for (const chapter of project.chapters) {
    if (!isWithinRoot(chapter.path, root)) throw new Error('A chapter is outside this Vault.');
    notes.push({ ...chapter, name: basenameOf(chapter.path), content: await readDocumentText(chapter.path) });
  }
  const content = buildBookManuscript(project, notes, root);
  const path = `${root}/book-proof-${crypto.randomUUID()}.adoc`;
  await writeDocumentText(path, content);
  return path;
}
