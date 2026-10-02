import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FileTreeFileSystem } from './fileTreeService';

const { readDirMock, existsMock, mkdirMock, removeMock, renameMock, writeTextFileMock } = {
  readDirMock: vi.fn(),
  existsMock: vi.fn(),
  mkdirMock: vi.fn(),
  removeMock: vi.fn(),
  renameMock: vi.fn(),
  writeTextFileMock: vi.fn(),
};

const {
  listDirectory,
  nextAvailableName,
  withPreservedExtension,
  isSafeEntryName,
  createNote,
  createFolder,
  renamePath,
  deletePath,
  movePath,
} = await import('./fileTreeService');

const fileSystem: FileTreeFileSystem = {
  readDirectory: readDirMock,
  exists: existsMock,
  mkdir: mkdirMock,
  remove: removeMock,
  rename: renameMock,
  writeText: writeTextFileMock,
};

beforeEach(() => {
  readDirMock.mockReset();
  existsMock.mockReset();
  mkdirMock.mockReset();
  removeMock.mockReset();
  renameMock.mockReset();
  writeTextFileMock.mockReset();
});

describe('listDirectory', () => {
  it('filters out ignored entries (node_modules, .git, dist, target, .DS_Store)', async () => {
    readDirMock.mockResolvedValue([
      { name: 'node_modules', isDirectory: true },
      { name: '.git', isDirectory: true },
      { name: 'dist', isDirectory: true },
      { name: 'target', isDirectory: true },
      { name: '.DS_Store', isDirectory: false },
      { name: 'main.adoc', isDirectory: false },
    ]);

    const entries = await listDirectory(fileSystem, '/book');

    expect(entries.map((e) => e.name)).toEqual(['main.adoc']);
  });

  it('sorts directories before files, alphabetically within each group', async () => {
    readDirMock.mockResolvedValue([
      { name: 'zebra.adoc', isDirectory: false },
      { name: 'images', isDirectory: true },
      { name: 'apple.adoc', isDirectory: false },
      { name: 'chapters', isDirectory: true },
    ]);

    const entries = await listDirectory(fileSystem, '/book');

    expect(entries.map((e) => e.name)).toEqual(['chapters', 'images', 'apple.adoc', 'zebra.adoc']);
  });

  it("builds each entry's path as dirPath/name", async () => {
    readDirMock.mockResolvedValue([{ name: 'main.adoc', isDirectory: false }]);

    const entries = await listDirectory(fileSystem, '/Users/foo/book');

    expect(entries[0].path).toBe('/Users/foo/book/main.adoc');
  });
});

describe('nextAvailableName', () => {
  it('returns the base name unchanged when nothing collides', () => {
    expect(nextAvailableName(['other.adoc'], 'New Note.adoc')).toBe('New Note.adoc');
  });

  it('appends " 1" before the extension on a collision', () => {
    expect(nextAvailableName(['New Note.adoc'], 'New Note.adoc')).toBe('New Note 1.adoc');
  });

  it('keeps incrementing past multiple collisions', () => {
    const existing = ['New Note.adoc', 'New Note 1.adoc', 'New Note 2.adoc'];
    expect(nextAvailableName(existing, 'New Note.adoc')).toBe('New Note 3.adoc');
  });

  it('works for extensionless names (folders)', () => {
    expect(nextAvailableName(['New Folder'], 'New Folder')).toBe('New Folder 1');
  });
});

describe('withPreservedExtension', () => {
  it('carries over the old extension when the new name omits one', () => {
    expect(withPreservedExtension('Introduction', 'intro.adoc', false)).toBe('Introduction.adoc');
  });

  it('leaves the new name untouched when it already has an extension', () => {
    expect(withPreservedExtension('notes.txt', 'intro.adoc', false)).toBe('notes.txt');
  });

  it('is a no-op for directories', () => {
    expect(withPreservedExtension('renamed', 'chapters', true)).toBe('renamed');
  });

  it('is a no-op when the old name had no extension either', () => {
    expect(withPreservedExtension('renamed', 'README', false)).toBe('renamed');
  });
});

describe('createNote', () => {
  it('writes a new note with an auto-picked name and a matching title header', async () => {
    const path = await createNote(fileSystem, '/book', ['index.adoc']);

    expect(path).toBe('/book/New Note.adoc');
    expect(writeTextFileMock).toHaveBeenCalledWith('/book/New Note.adoc', '= New Note\n\n');
  });

  it('avoids colliding with an existing sibling', async () => {
    const path = await createNote(fileSystem, '/book', ['New Note.adoc']);

    expect(path).toBe('/book/New Note 1.adoc');
    expect(writeTextFileMock).toHaveBeenCalledWith('/book/New Note 1.adoc', '= New Note 1\n\n');
  });
});

describe('createFolder', () => {
  it('creates a new folder with an auto-picked name', async () => {
    const path = await createFolder(fileSystem, '/book', ['chapters']);

    expect(path).toBe('/book/New Folder');
    expect(mkdirMock).toHaveBeenCalledWith('/book/New Folder');
  });
});

describe('renamePath', () => {
  it('renames within the same parent folder', async () => {
    existsMock.mockResolvedValue(false);

    const newPath = await renamePath(fileSystem, '/book/old.adoc', 'new.adoc');

    expect(newPath).toBe('/book/new.adoc');
    expect(renameMock).toHaveBeenCalledWith('/book/old.adoc', '/book/new.adoc');
  });

  it('is a no-op for a blank or unchanged name', async () => {
    expect(await renamePath(fileSystem, '/book/old.adoc', '  ')).toBe('/book/old.adoc');
    expect(await renamePath(fileSystem, '/book/old.adoc', 'old.adoc')).toBe('/book/old.adoc');
    expect(renameMock).not.toHaveBeenCalled();
  });

  it('refuses to clobber an existing sibling', async () => {
    existsMock.mockResolvedValue(true);

    await expect(renamePath(fileSystem, '/book/old.adoc', 'taken.adoc')).rejects.toThrow('already exists');
    expect(renameMock).not.toHaveBeenCalled();
  });

  it.each(['../outside.adoc', 'nested/name.adoc', 'nested\\name.adoc', '.', '..'])(
    'rejects a path-like name (%s)',
    async (unsafeName) => {
      await expect(renamePath(fileSystem, '/book/old.adoc', unsafeName)).rejects.toThrow(
        'cannot contain path separators',
      );
      expect(renameMock).not.toHaveBeenCalled();
    },
  );
});

describe('isSafeEntryName', () => {
  it('only accepts a single non-dot path segment', () => {
    expect(isSafeEntryName('chapter 1.adoc')).toBe(true);
    expect(isSafeEntryName('../chapter 1.adoc')).toBe(false);
    expect(isSafeEntryName('.')).toBe(false);
  });
});

describe('deletePath', () => {
  it('deletes a file non-recursively', async () => {
    await deletePath(fileSystem, '/book/old.adoc', false);
    expect(removeMock).toHaveBeenCalledWith('/book/old.adoc', { recursive: false });
  });

  it('deletes a folder recursively', async () => {
    await deletePath(fileSystem, '/book/chapters', true);
    expect(removeMock).toHaveBeenCalledWith('/book/chapters', { recursive: true });
  });
});

describe('movePath', () => {
  it('moves a file into a different folder, keeping its name', async () => {
    existsMock.mockResolvedValue(false);

    const newPath = await movePath(fileSystem, '/book/chapter1.adoc', '/book/archive');

    expect(newPath).toBe('/book/archive/chapter1.adoc');
    expect(renameMock).toHaveBeenCalledWith('/book/chapter1.adoc', '/book/archive/chapter1.adoc');
  });

  it('is a no-op when dropped on its own current parent', async () => {
    expect(await movePath(fileSystem, '/book/chapter1.adoc', '/book')).toBe('/book/chapter1.adoc');
    expect(renameMock).not.toHaveBeenCalled();
  });

  it('refuses to clobber an existing file at the destination', async () => {
    existsMock.mockResolvedValue(true);

    await expect(movePath(fileSystem, '/book/chapter1.adoc', '/book/archive')).rejects.toThrow('already exists');
    expect(renameMock).not.toHaveBeenCalled();
  });
});
