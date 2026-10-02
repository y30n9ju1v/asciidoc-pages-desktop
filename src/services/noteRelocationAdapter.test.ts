import { beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({
  exists: vi.fn(),
  mkdir: vi.fn(),
  rename: vi.fn(),
  write: vi.fn(),
  index: vi.fn(),
  load: vi.fn(),
  save: vi.fn(),
}));
vi.mock('@tauri-apps/plugin-fs', () => ({ exists: mock.exists, mkdir: mock.mkdir, rename: mock.rename }));
vi.mock('./documentFileAdapter', () => ({ writeDocumentText: mock.write }));
vi.mock('./vaultAdapter', () => ({ indexVaultFromTauri: mock.index }));
vi.mock('./bookProjectAdapter', () => ({ loadBookProject: mock.load, saveBookProject: mock.save }));
import { relocateVaultEntry } from './noteRelocationAdapter';
import { createBookProject } from './bookProjectService';
import { documentHistoryDirectory } from './documentHistoryService';

beforeEach(() => {
  vi.resetAllMocks();
  mock.exists.mockResolvedValue(false);
  mock.load.mockResolvedValue({ project: null, source: null });
  mock.index.mockResolvedValue([
    { path: '/vault/a.adoc', name: 'a', title: 'A', content: '= A' },
    { path: '/vault/main.adoc', name: 'main', title: 'Main', content: 'See [[A]].' },
  ]);
});

describe('reference-aware relocation', () => {
  it('backs up originals before moving and uses expected content when rewriting', async () => {
    await relocateVaultEntry('/vault', '/vault/a.adoc', '/vault/b.adoc');
    expect(mock.write.mock.calls[0][0]).toMatch(/recovery.json$/);
    expect(mock.write.mock.invocationCallOrder[0]).toBeLessThan(mock.rename.mock.invocationCallOrder[0]);
    expect(mock.write).toHaveBeenCalledWith('/vault/main.adoc', 'See [[b.adoc|A]].', 'See [[A]].');
  });
  it('rolls the move back when reference writes fail', async () => {
    mock.write.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('disk full'));
    await expect(relocateVaultEntry('/vault', '/vault/a.adoc', '/vault/b.adoc')).rejects.toThrow('disk full');
    expect(mock.rename).toHaveBeenLastCalledWith('/vault/b.adoc', '/vault/a.adoc');
  });
  it('rejects path escape and destination collisions before writing', async () => {
    await expect(relocateVaultEntry('/vault', '/vault/a.adoc', '/outside.adoc')).rejects.toThrow('within the Vault');
    mock.exists.mockResolvedValue(true);
    await expect(relocateVaultEntry('/vault', '/vault/a.adoc', '/vault/b.adoc')).rejects.toThrow('already exists');
    expect(mock.write).not.toHaveBeenCalled();
  });

  it('does not move anything if the recovery record cannot be saved', async () => {
    mock.write.mockRejectedValue(new Error('backup failed'));
    await expect(relocateVaultEntry('/vault', '/vault/a.adoc', '/vault/b.adoc')).rejects.toThrow('backup failed');
    expect(mock.rename).not.toHaveBeenCalled();
  });

  it('restores applied references using expected rewritten content after a later write fails', async () => {
    const notes = await mock.index();
    mock.index.mockResolvedValue([...notes, { ...notes[1], path: '/vault/other.adoc' }]);
    mock.write
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('second write failed'))
      .mockResolvedValueOnce(undefined);
    await expect(relocateVaultEntry('/vault', '/vault/a.adoc', '/vault/b.adoc')).rejects.toThrow('second write failed');
    expect(mock.write).toHaveBeenLastCalledWith('/vault/main.adoc', 'See [[A]].', 'See [[b.adoc|A]].');
    expect(mock.rename).toHaveBeenLastCalledWith('/vault/b.adoc', '/vault/a.adoc');
  });

  it('reports the recovery record and both errors without forcing a conflicting rollback', async () => {
    const notes = await mock.index();
    mock.index.mockResolvedValue([...notes, { ...notes[1], path: '/vault/other.adoc' }]);
    mock.write
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('disk full'))
      .mockRejectedValueOnce(new Error('external edit'));
    const result = relocateVaultEntry('/vault', '/vault/a.adoc', '/vault/b.adoc');
    await expect(result).rejects.toThrow(/disk full.*external edit.*relocations\/.*\/recovery.json/);
    expect(mock.rename).toHaveBeenCalledTimes(1);
  });

  it('restores history and references if saving the book fails', async () => {
    const project = createBookProject({ title: 'Book', author: '', lang: 'en', email: '', attributes: {} });
    project.chapters = [{ path: '/vault/a.adoc', title: 'A', status: 'draft' }];
    mock.load.mockResolvedValue({ project, source: 'original book' });
    const from = documentHistoryDirectory('/vault', '/vault/a.adoc');
    const to = documentHistoryDirectory('/vault', '/vault/b.adoc');
    mock.exists.mockImplementation(async (path) => path === from);
    mock.save.mockRejectedValue(new Error('book changed'));
    await expect(relocateVaultEntry('/vault', '/vault/a.adoc', '/vault/b.adoc')).rejects.toThrow('book changed');
    expect(mock.save).toHaveBeenCalledWith(
      '/vault',
      {
        ...project,
        chapters: [{ ...project.chapters[0], path: '/vault/b.adoc' }],
      },
      'original book',
    );
    expect(mock.rename.mock.calls).toEqual([
      ['/vault/a.adoc', '/vault/b.adoc'],
      [from, to],
      [to, from],
      ['/vault/b.adoc', '/vault/a.adoc'],
    ]);
    expect(mock.write).toHaveBeenLastCalledWith('/vault/main.adoc', 'See [[A]].', 'See [[b.adoc|A]].');
  });

  it('rejects colliding histories before creating a backup or moving files', async () => {
    mock.exists.mockImplementation(async (path: string) => path.includes('/history/'));
    await expect(relocateVaultEntry('/vault', '/vault/a.adoc', '/vault/b.adoc')).rejects.toThrow(
      'already has document history',
    );
    expect(mock.write).not.toHaveBeenCalled();
    expect(mock.rename).not.toHaveBeenCalled();
  });
});
