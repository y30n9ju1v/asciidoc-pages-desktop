import { open } from '@tauri-apps/plugin-dialog';
import { readTextFile } from '@tauri-apps/plugin-fs';
import { parseBibtex, type BibtexImportResult } from './bibtexService';

/** The native picker grants a runtime read scope only for the chosen .bib
 * file. Nothing is copied into the vault until the author saves the
 * resulting bibliography through the existing Book Project flow. */
export async function importBibtexFromPicker(): Promise<BibtexImportResult | null> {
  const path = await open({
    multiple: false,
    directory: false,
    filters: [{ name: 'BibTeX bibliography', extensions: ['bib'] }],
  });
  if (!path || Array.isArray(path)) return null;
  return parseBibtex(await readTextFile(path));
}
