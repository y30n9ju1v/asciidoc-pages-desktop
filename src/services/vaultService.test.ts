import { describe, it, expect, vi } from 'vitest';
import { indexVault, sanitizeFileName, titleOf, type VaultCache, type VaultFileSystem } from './vaultService';

describe('titleOf', () => {
  it('pulls the document title from a leading "= Title" line', () => {
    expect(titleOf('= Meeting Notes\n:author: Me\n\nBody text.', 'meeting-notes.adoc')).toBe('Meeting Notes');
  });

  it('falls back to the filename (without extension) when there is no title line', () => {
    expect(titleOf('Just some body text, no title.', 'untitled-thoughts.adoc')).toBe('untitled-thoughts');
  });

  it('finds the title line even when it is not the very first line', () => {
    expect(titleOf('\n\n= Later Title\nBody.', 'x.adoc')).toBe('Later Title');
  });
});

describe('sanitizeFileName', () => {
  it('replaces filesystem-unsafe characters with a hyphen', () => {
    expect(sanitizeFileName('What/Why: A Note?')).toBe('What-Why- A Note-');
  });

  it('leaves an already-safe title untouched', () => {
    expect(sanitizeFileName('Meeting Notes')).toBe('Meeting Notes');
  });

  it('trims surrounding whitespace', () => {
    expect(sanitizeFileName('  Padded Title  ')).toBe('Padded Title');
  });
});

describe('indexVault', () => {
  it('walks only supported note files through its injected filesystem port', async () => {
    const fileSystem: VaultFileSystem = {
      readDirectory: async (path) => {
        if (path === '/vault') {
          return [
            { name: 'chapter.adoc', isDirectory: false },
            { name: 'assets', isDirectory: true },
            { name: 'ignored.pdf', isDirectory: false },
          ];
        }
        return [{ name: 'note.txt', isDirectory: false }];
      },
      readText: async (path) => (path.endsWith('chapter.adoc') ? '= Chapter' : 'A plain note'),
    };

    await expect(indexVault(fileSystem, '/vault')).resolves.toEqual([
      { path: '/vault/chapter.adoc', name: 'chapter', title: 'Chapter', content: '= Chapter' },
      { path: '/vault/assets/note.txt', name: 'note', title: 'note', content: 'A plain note' },
    ]);
  });

  it('rejects nesting deeper than the supported 12 levels instead of silently truncating', async () => {
    const fileSystem: VaultFileSystem = {
      readDirectory: async () => [{ name: 'nested', isDirectory: true }],
      readText: async () => '',
    };
    await expect(indexVault(fileSystem, '/vault')).rejects.toThrow('12 levels');
  });

  it('propagates a read failure instead of silently skipping the note', async () => {
    const fileSystem: VaultFileSystem = {
      readDirectory: async () => [{ name: 'broken.adoc', isDirectory: false }],
      readText: async () => {
        throw new Error('permission denied');
      },
    };
    await expect(indexVault(fileSystem, '/vault')).rejects.toThrow('permission denied');
  });

  describe('fingerprint caching', () => {
    it('reuses the cached note when the fingerprint is unchanged, never calling readText again', async () => {
      const readText = vi.fn().mockResolvedValue('= Chapter');
      const fileSystem: VaultFileSystem = {
        readDirectory: async () => [{ name: 'chapter.adoc', isDirectory: false }],
        readText,
        fingerprint: async () => 'v1',
      };
      const cache: VaultCache = new Map();
      const first = await indexVault(fileSystem, '/vault', cache);
      const second = await indexVault(fileSystem, '/vault', cache);
      expect(readText).toHaveBeenCalledTimes(1);
      expect(second).toEqual(first);
      expect(second[0]).toBe(first[0]);
    });

    it('re-reads when the fingerprint changes', async () => {
      const readText = vi.fn().mockResolvedValueOnce('= Chapter v1').mockResolvedValueOnce('= Chapter v2');
      let fingerprint = 'v1';
      const fileSystem: VaultFileSystem = {
        readDirectory: async () => [{ name: 'chapter.adoc', isDirectory: false }],
        readText,
        fingerprint: async () => fingerprint,
      };
      const cache: VaultCache = new Map();
      const first = await indexVault(fileSystem, '/vault', cache);
      fingerprint = 'v2';
      const second = await indexVault(fileSystem, '/vault', cache);
      expect(readText).toHaveBeenCalledTimes(2);
      expect(first[0].content).toBe('= Chapter v1');
      expect(second[0].content).toBe('= Chapter v2');
    });

    it('always re-reads when fingerprint() reports null', async () => {
      const readText = vi.fn().mockResolvedValue('= Chapter');
      const fileSystem: VaultFileSystem = {
        readDirectory: async () => [{ name: 'chapter.adoc', isDirectory: false }],
        readText,
        fingerprint: async () => null,
      };
      const cache: VaultCache = new Map();
      await indexVault(fileSystem, '/vault', cache);
      await indexVault(fileSystem, '/vault', cache);
      expect(readText).toHaveBeenCalledTimes(2);
    });

    it('evicts a cache entry once its file no longer appears in the vault', async () => {
      let entries = [{ name: 'a.adoc', isDirectory: false }];
      const fileSystem: VaultFileSystem = {
        readDirectory: async () => entries,
        readText: async () => '= A',
        fingerprint: async () => 'v1',
      };
      const cache: VaultCache = new Map();
      await indexVault(fileSystem, '/vault', cache);
      expect(cache.has('/vault/a.adoc')).toBe(true);
      entries = [];
      await indexVault(fileSystem, '/vault', cache);
      expect(cache.has('/vault/a.adoc')).toBe(false);
    });
  });
});
