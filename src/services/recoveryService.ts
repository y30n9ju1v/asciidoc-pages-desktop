import { exists, mkdir, readTextFile, remove, writeTextFile } from '@tauri-apps/plugin-fs';
import { appDataDir, BaseDirectory } from '@tauri-apps/api/path';

const RECOVERY_FILE = 'recovery.json';

interface RecoverySnapshot {
  content: string;
  path: string | null;
  savedAt: string;
}

export async function writeRecoverySnapshot(content: string, path: string | null): Promise<void> {
  const snapshot: RecoverySnapshot = { content, path, savedAt: new Date().toISOString() };
  try {
    // The app data directory isn't created automatically - on a fresh install
    // nothing has ever written there yet, so writeTextFile fails with ENOENT
    // unless we ensure it exists first. `recursive: true` is a no-op if it's
    // already there, so this is safe to call on every autosave tick. Resolving
    // the absolute path first avoids passing "." as a relative mkdir target,
    // which Rust's create_dir_all chokes on (tries to mkdir a literal "." entry).
    await mkdir(await appDataDir(), { recursive: true });
    await writeTextFile(RECOVERY_FILE, JSON.stringify(snapshot), { baseDir: BaseDirectory.AppData });
  } catch (error) {
    console.error('Failed to write recovery snapshot:', error);
  }
}

export async function readRecoverySnapshot(): Promise<RecoverySnapshot | null> {
  try {
    if (!(await exists(RECOVERY_FILE, { baseDir: BaseDirectory.AppData }))) {
      return null;
    }
    const raw = await readTextFile(RECOVERY_FILE, { baseDir: BaseDirectory.AppData });
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object') return null;
    const snapshot = value as Partial<RecoverySnapshot>;
    if (typeof snapshot.content !== 'string' || typeof snapshot.savedAt !== 'string') return null;
    if (snapshot.path !== null && typeof snapshot.path !== 'string') return null;
    return snapshot as RecoverySnapshot;
  } catch (error) {
    console.error('Failed to read recovery snapshot:', error);
    return null;
  }
}

export async function clearRecoverySnapshot(): Promise<void> {
  try {
    if (await exists(RECOVERY_FILE, { baseDir: BaseDirectory.AppData })) {
      await remove(RECOVERY_FILE, { baseDir: BaseDirectory.AppData });
    }
  } catch (error) {
    console.error('Failed to clear recovery snapshot:', error);
  }
}
