import { exists, mkdir, readTextFile } from '@tauri-apps/plugin-fs';
import {
  bookProjectPath,
  parseBookProject,
  serializeBookProject,
  BOOK_PROJECT_DIRECTORY,
  type BookProject,
} from './bookProjectService';
import { writeDocumentText } from './documentFileAdapter';

export async function loadBookProject(root: string): Promise<{ project: BookProject | null; source: string | null }> {
  const path = bookProjectPath(root);
  const source = (await exists(path)) ? await readTextFile(path) : null;
  const project = source === null ? null : parseBookProject(source);
  if (source !== null && !project)
    throw new Error('Book metadata is invalid. Restore book.json from your backup before saving.');
  return { project, source };
}

export async function saveBookProject(root: string, project: BookProject, expected: string | null): Promise<string> {
  await mkdir(`${root}/${BOOK_PROJECT_DIRECTORY}`, { recursive: true });
  const source = serializeBookProject(project);
  await writeDocumentText(bookProjectPath(root), source, expected);
  return source;
}
