import { writeDocumentText } from './documentFileAdapter';
import { isWithinRoot } from './pathSafety';
import { sanitizeFileName } from './vaultService';

export async function extractLinkedNote(root: string, sourcePath: string, selection: string): Promise<string> {
  if (!selection.trim()) throw new Error('Select text to extract.');
  if (!isWithinRoot(sourcePath, root)) throw new Error('Save the source note inside the Vault first.');
  const title = selection
    .split('\n')
    .find((line) => line.trim())!
    .replace(/[[\]|]/g, '')
    .slice(0, 60)
    .trim();
  const name = `${sanitizeFileName(title) || 'Note'}-${crypto.randomUUID()}.adoc`;
  const source = sourcePath.slice(root.length + 1);
  const content = `= ${title}\n\n${selection}\n\nSource: [[${source}|Original note]]\n`;
  await writeDocumentText(`${root}/${name}`, content);
  return `[[${name}|${title}]]`;
}
