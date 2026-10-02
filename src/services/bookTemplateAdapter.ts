import { exists, mkdir, writeTextFile } from '@tauri-apps/plugin-fs';
import type { BookTemplatePlan } from './bookTemplateService';
import { resolveWithinRoot } from './pathSafety';

export function templatePathWithinVault(vaultRoot: string, relativePath: string): string {
  const resolved = resolveWithinRoot(vaultRoot, relativePath, vaultRoot);
  if (!resolved || relativePath.startsWith('/'))
    throw new Error('Starter book path must stay inside the selected Vault.');
  return resolved;
}

function parentDirectory(path: string): string {
  const index = path.lastIndexOf('/');
  return index === -1 ? '' : path.slice(0, index);
}

async function ensureTemplateFilesAreNew(vaultRoot: string, plan: BookTemplatePlan): Promise<void> {
  const conflicts = await Promise.all(
    plan.files.map(async (file) => ((await exists(templatePathWithinVault(vaultRoot, file.path))) ? file.path : null)),
  );
  const conflict = conflicts.find(Boolean);
  if (conflict) throw new Error(`Cannot create the starter book because ${conflict} already exists.`);
}

async function writeTemplateFile(vaultRoot: string, path: string, content: string): Promise<void> {
  const absolute = templatePathWithinVault(vaultRoot, path);
  const parent = parentDirectory(absolute);
  if (parent) await mkdir(parent, { recursive: true });
  await writeTextFile(absolute, content);
}

/** Writes a checked starter plan only inside a user-selected vault. */
export async function writeBookTemplate(vaultRoot: string, plan: BookTemplatePlan): Promise<string> {
  await ensureTemplateFilesAreNew(vaultRoot, plan);
  await Promise.all(plan.files.map((file) => writeTemplateFile(vaultRoot, file.path, file.content)));
  return templatePathWithinVault(vaultRoot, plan.mainDocumentPath);
}
