import { copyFile, mkdir, readDir, readTextFile } from '@tauri-apps/plugin-fs';
import { chooseVaultFolderPath } from './vaultDialogAdapter';
import { IGNORED_DIR_ENTRY_NAMES, isWithinRoot } from './pathSafety';
import { writeDocumentText } from './documentFileAdapter';
import { convertMarkdown } from './markdownImportService';

async function listImportFiles(root: string, relative: string, depth: number): Promise<string[]> {
  if (depth > 12) throw new Error('Import folder nesting exceeds 12 levels.');
  const files: string[] = [];
  for (const entry of await readDir(`${root}/${relative}`)) {
    if (IGNORED_DIR_ENTRY_NAMES.has(entry.name) || entry.isSymlink) continue;
    const path = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isDirectory) files.push(...(await listImportFiles(root, path, depth + 1)));
    else if (/\.(md|markdown|png|jpe?g|gif|webp|svg)$/i.test(path)) files.push(path);
    if (files.length > 10000) throw new Error('Import is limited to 10,000 notes and images at a time.');
  }
  return files;
}

async function writeImportFile(source: string, destination: string, relative: string): Promise<string[]> {
  const target = `${destination}/${relative.replace(/\.(md|markdown)$/i, '.adoc')}`;
  await mkdir(target.slice(0, target.lastIndexOf('/')), { recursive: true });
  if (!/\.(md|markdown)$/i.test(relative)) {
    await copyFile(`${source}/${relative}`, target);
    return [];
  }
  const original = await readTextFile(`${source}/${relative}`);
  const converted = convertMarkdown(original);
  await writeDocumentText(target, converted.content);
  const backup = `${destination}/.asciidoc-studio/import-originals/${relative}`;
  await mkdir(backup.slice(0, backup.lastIndexOf('/')), { recursive: true });
  await writeDocumentText(backup, original);
  return converted.warnings.map((warning) => `${relative}: ${warning}`);
}

export async function importMarkdownFolder(vaultRoot: string): Promise<string | null> {
  const source = await chooseVaultFolderPath();
  if (!source) return null;
  if (isWithinRoot(vaultRoot, source)) throw new Error('Choose a source folder outside the destination Vault.');
  const files = await listImportFiles(source, '', 0);
  if (!files.some((path) => /\.(md|markdown)$/i.test(path))) throw new Error('No Markdown notes found.');
  const destination = `${vaultRoot}/Imported-${crypto.randomUUID()}`;
  await mkdir(destination);
  const warnings: string[] = [];
  try {
    for (const file of files) warnings.push(...(await writeImportFile(source, destination, file)));
  } catch (error) {
    await writeDocumentText(
      `${destination}/IMPORT-INCOMPLETE.txt`,
      'Import stopped before completion. Originals in the source folder are unchanged. Inspect this partial import before using it.',
    ).catch(() => {});
    throw error;
  }
  const report = `${destination}/IMPORT-REPORT.adoc`;
  await writeDocumentText(
    report,
    `= Markdown Import Report\n\nImported ${files.length} notes and images. Original Markdown is retained in .asciidoc-studio/import-originals.\n\nReview formatting and links before publishing. Plugin syntax, YAML properties, embedded notes, tables and footnotes require manual review.\n\n${warnings.map((line) => `* ${line}`).join('\n')}`,
  );
  return report;
}
