import { exists, mkdir, readDir, readTextFile, remove, writeTextFile } from '@tauri-apps/plugin-fs';
import { resolveWithinRoot } from './pathSafety';
import { nextAvailableName, isSafeEntryName } from './fileTreeService';
import { applyTemplatePlaceholders, isoDateToday, TEMPLATES_DIRECTORY, type NoteTemplate } from './noteTemplateService';

function templatesDir(vaultRoot: string): string {
  return `${vaultRoot}/${TEMPLATES_DIRECTORY}`;
}

/** Every saved template, sorted by name. Empty (not an error) when the
 * templates folder doesn't exist yet - a vault with no templates saved is
 * the normal starting state, not a failure. */
export async function listNoteTemplates(vaultRoot: string): Promise<NoteTemplate[]> {
  const dir = templatesDir(vaultRoot);
  if (!(await exists(dir))) return [];

  const entries = await readDir(dir);
  const templates: NoteTemplate[] = [];
  for (const entry of entries) {
    if (entry.isDirectory || !entry.name.endsWith('.adoc')) continue;
    const content = await readTextFile(`${dir}/${entry.name}`);
    templates.push({ name: entry.name.replace(/\.adoc$/, ''), content });
  }
  return templates.sort((a, b) => a.name.localeCompare(b.name));
}

/** Saves (or overwrites) a template under this vault's templates folder -
 * "Save current document as template" writes here. `name` is validated the
 * same way a tree-entry rename is (fileTreeService.ts's isSafeEntryName):
 * it becomes a filename, never a path expression. */
export async function saveNoteTemplate(vaultRoot: string, name: string, content: string): Promise<void> {
  if (!isSafeEntryName(`${name}.adoc`)) {
    throw new Error('Template name cannot be empty or contain path separators.');
  }
  const dir = templatesDir(vaultRoot);
  await mkdir(dir, { recursive: true });
  const path = resolveWithinRoot(dir, `${name}.adoc`, dir);
  if (!path) throw new Error('Invalid template name.');
  await writeTextFile(path, content);
}

export async function deleteNoteTemplateFile(vaultRoot: string, name: string): Promise<void> {
  const dir = templatesDir(vaultRoot);
  const path = resolveWithinRoot(dir, `${name}.adoc`, dir);
  if (!path) throw new Error('Invalid template name.');
  await remove(path);
}

/**
 * Creates a new note in dirPath from a template, with {{title}}/{{date}}
 * expanded - mirrors fileTreeService.ts's own createNote (auto-numbered
 * against siblingNames so it never overwrites an existing file), just
 * seeded from the template's content instead of an empty "= Title" stub.
 */
export async function createNoteFromTemplate(
  dirPath: string,
  siblingNames: string[],
  template: NoteTemplate,
): Promise<string> {
  const name = nextAvailableName(siblingNames, `${template.name}.adoc`);
  const path = `${dirPath}/${name}`;
  const title = name.replace(/\.adoc$/, '');
  await writeTextFile(path, applyTemplatePlaceholders(template.content, { title, date: isoDateToday() }));
  return path;
}
