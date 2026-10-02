import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { exists, readTextFile, writeTextFile, remove } from '@tauri-apps/plugin-fs';
import { clearRecoverySnapshot, readRecoverySnapshot, writeRecoverySnapshot } from './recoveryService';
vi.mock('@tauri-apps/plugin-fs', () => ({
  exists: vi.fn(),
  readTextFile: vi.fn(),
  writeTextFile: vi.fn(),
  remove: vi.fn(),
  mkdir: vi.fn(),
}));
vi.mock('@tauri-apps/api/path', () => ({ appDataDir: async () => '/app', BaseDirectory: { AppData: 1 } }));
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(exists).mockResolvedValue(true);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());
it.each(['{', 'null', '{}', '{"content":42,"path":null,"savedAt":"today"}', '{"content":"draft","savedAt":"today"}'])(
  'rejects malformed recovery data without deleting it: %s',
  async (raw) => {
    vi.mocked(readTextFile).mockResolvedValue(raw);
    expect(await readRecoverySnapshot()).toBeNull();
    expect(remove).not.toHaveBeenCalled();
  },
);
it('returns valid recovery data without writing to the manuscript', async () => {
  const snapshot = { content: 'unsaved', path: '/book/main.adoc', savedAt: '2026-10-02' };
  vi.mocked(readTextFile).mockResolvedValue(JSON.stringify(snapshot));
  expect(await readRecoverySnapshot()).toEqual(snapshot);
  expect(writeTextFile).not.toHaveBeenCalled();
});
it('handles read, write and removal failures without an unhandled rejection', async () => {
  vi.mocked(readTextFile).mockRejectedValue(new Error('Permission denied'));
  expect(await readRecoverySnapshot()).toBeNull();
  vi.mocked(writeTextFile).mockRejectedValue(new Error('Disk full'));
  await expect(writeRecoverySnapshot('draft', '/book/main.adoc')).resolves.toBeUndefined();
  expect(remove).not.toHaveBeenCalled();
  vi.mocked(remove).mockRejectedValue(new Error('Permission denied'));
  await expect(clearRecoverySnapshot()).resolves.toBeUndefined();
  expect(console.error).toHaveBeenCalledTimes(3);
});
