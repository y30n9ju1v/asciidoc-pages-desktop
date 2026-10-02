import { exists, mkdir, readDir, readTextFile, remove, writeTextFile } from '@tauri-apps/plugin-fs';
import { isSafeEntryName } from './fileTreeService';
import { resolveWithinRoot } from './pathSafety';
import {
  CUSTOM_PUBLICATION_TEMPLATES_DIRECTORY,
  parseCustomPublicationTemplate,
  type CustomPublicationTemplate,
} from './customPublicationTemplateService';

function templatesDirectory(vaultRoot: string): string {
  return `${vaultRoot}/${CUSTOM_PUBLICATION_TEMPLATES_DIRECTORY}`;
}

function templatePath(vaultRoot: string, id: string): string {
  if (!/^custom-[a-z0-9-]{1,80}$/.test(id) || !isSafeEntryName(`${id}.json`)) {
    throw new Error('Invalid rendering template identifier.');
  }
  const directory = templatesDirectory(vaultRoot);
  const path = resolveWithinRoot(directory, `${id}.json`, directory);
  if (!path) throw new Error('Invalid rendering template path.');
  return path;
}

export async function listCustomPublicationTemplates(vaultRoot: string): Promise<CustomPublicationTemplate[]> {
  const directory = templatesDirectory(vaultRoot);
  if (!(await exists(directory))) return [];
  const entries = await readDir(directory);
  const templates = await Promise.all(
    entries
      .filter((entry) => !entry.isDirectory && entry.name.endsWith('.json'))
      // A manually edited or partially-synced template must not make every
      // other valid template disappear. Invalid files are ignored until the
      // user fixes/removes them; their contents are never executed.
      .map(async (entry) => {
        try {
          return parseCustomPublicationTemplate(JSON.parse(await readTextFile(`${directory}/${entry.name}`)));
        } catch {
          return null;
        }
      }),
  );
  return templates
    .filter((template): template is CustomPublicationTemplate => template !== null)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function saveCustomPublicationTemplate(
  vaultRoot: string,
  template: CustomPublicationTemplate,
): Promise<void> {
  const validated = parseCustomPublicationTemplate(template);
  if (!validated) throw new Error('Invalid rendering template.');
  await mkdir(templatesDirectory(vaultRoot), { recursive: true });
  await writeTextFile(templatePath(vaultRoot, validated.id), `${JSON.stringify(validated, null, 2)}\n`);
}

export async function deleteCustomPublicationTemplate(vaultRoot: string, id: string): Promise<void> {
  await remove(templatePath(vaultRoot, id));
}
