import { exists, mkdir, readDir, readTextFile, remove, writeTextFile } from '@tauri-apps/plugin-fs';
import {
  documentHistoryDirectory,
  keepLatestSnapshots,
  snapshotCreatedAt,
  snapshotFileName,
  type DocumentSnapshot,
} from './documentHistoryService';

function snapshotPath(directory: string, createdAt: Date): string {
  return `${directory}/${snapshotFileName(createdAt)}`;
}

async function uniqueSnapshotPath(directory: string): Promise<string> {
  const initialPath = snapshotPath(directory, new Date());
  if (!(await exists(initialPath))) return initialPath;
  for (let suffix = 1; ; suffix += 1) {
    const candidate = `${initialPath.replace(/\.adoc$/, '')}-${suffix}.adoc`;
    if (!(await exists(candidate))) return candidate;
  }
}

async function listSnapshotsIn(directory: string): Promise<DocumentSnapshot[]> {
  if (!(await exists(directory))) return [];
  const entries = await readDir(directory);
  return entries.flatMap((entry) => {
    const createdAt = snapshotCreatedAt(`${directory}/${entry.name}`);
    return !entry.isDirectory && createdAt ? [{ path: `${directory}/${entry.name}`, createdAt }] : [];
  });
}

async function removeExpiredSnapshots(directory: string): Promise<void> {
  const snapshots = await listSnapshotsIn(directory);
  const keptPaths = new Set(keepLatestSnapshots(snapshots).map((snapshot) => snapshot.path));
  await Promise.all(
    snapshots.filter((snapshot) => !keptPaths.has(snapshot.path)).map((snapshot) => remove(snapshot.path)),
  );
}

export async function saveDocumentSnapshot(
  vaultRoot: string | null,
  documentPath: string,
  previousContent: string,
): Promise<void> {
  const directory = documentHistoryDirectory(vaultRoot, documentPath);
  if (!directory) return;
  await mkdir(directory, { recursive: true });
  await writeTextFile(await uniqueSnapshotPath(directory), previousContent);
  await removeExpiredSnapshots(directory);
}

export async function listDocumentSnapshots(
  vaultRoot: string | null,
  documentPath: string | null,
): Promise<DocumentSnapshot[]> {
  const directory = documentHistoryDirectory(vaultRoot, documentPath);
  return directory ? keepLatestSnapshots(await listSnapshotsIn(directory)) : [];
}

export async function readDocumentSnapshot(snapshot: DocumentSnapshot): Promise<string> {
  return readTextFile(snapshot.path);
}
