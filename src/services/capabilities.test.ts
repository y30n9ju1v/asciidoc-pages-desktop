import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const FILE_OPERATION_PERMISSIONS = [
  'fs:allow-write-text-file',
  'fs:allow-write-file',
  'fs:allow-read-file',
  'fs:allow-read-text-file',
  'fs:allow-read-dir',
  'fs:allow-mkdir',
  'fs:allow-remove',
  'fs:allow-rename',
  'fs:allow-exists',
  'fs:allow-stat',
  'fs:allow-copy-file',
];

interface ScopedPermission {
  identifier: string;
  allow?: unknown;
  deny?: unknown;
}

async function defaultCapability(): Promise<{ permissions: Array<string | ScopedPermission> }> {
  const source = await readFile(resolve(process.cwd(), 'src-tauri/capabilities/default.json'), 'utf8');
  return JSON.parse(source) as { permissions: Array<string | ScopedPermission> };
}

async function nativeScopeCommands(): Promise<string> {
  return readFile(resolve(process.cwd(), 'src-tauri/src/fs_scope_commands.rs'), 'utf8');
}

describe('default capability', () => {
  it('uses global scope plus dialog-granted runtime scope for direct file operations', async () => {
    const capability = await defaultCapability();

    const bareFilePermissions = capability.permissions.filter(
      (permission): permission is string => typeof permission === 'string' && permission.startsWith('fs:allow-'),
    );
    expect(bareFilePermissions).toEqual([
      ...FILE_OPERATION_PERMISSIONS,
      'fs:allow-appdata-write-recursive',
      'fs:allow-appcache-write-recursive',
    ]);

    const scope = capability.permissions.find(
      (permission): permission is ScopedPermission =>
        typeof permission !== 'string' && permission.identifier === 'fs:scope',
    );
    // A bare command permission only enables a command. It has no path scope
    // on its own: paths are the union of this static temporary scope, Tauri's
    // app-directory defaults, and folders granted by native file pickers.
    expect(scope?.allow).toEqual(['$TEMP/**']);
    expect(scope?.deny).toEqual(['$HOME/.ssh/**', '$HOME/.aws/**', '$HOME/.gnupg/**', '$HOME/Library/Keychains/**']);
    expect(capability.permissions).toContain('fs:default');
  });

  it('never exposes an arbitrary-path runtime scope grant to the WebView', async () => {
    const source = await nativeScopeCommands();

    expect(source).not.toContain('grant_fs_scope');
    expect(source).toContain('blocking_pick_file()');
    expect(source).toContain('blocking_save_file()');
    expect(source).toContain('blocking_pick_folder()');
    expect(source).toContain('allow_file(&path)');
    expect(source).toContain('allow_directory(&path, true)');
  });

  it('keeps the app data directory usable on macOS', async () => {
    const capability = await defaultCapability();
    const scope = capability.permissions.find(
      (permission): permission is ScopedPermission =>
        typeof permission !== 'string' && permission.identifier === 'fs:scope',
    );

    // macOS resolves AppData and AppLocalData to the same Application Support
    // location. Denying the latter would also block crash recovery in AppData.
    expect(JSON.stringify(scope)).not.toContain('$APPLOCALDATA');
  });
});
