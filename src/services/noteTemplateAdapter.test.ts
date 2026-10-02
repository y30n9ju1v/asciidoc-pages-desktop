import { describe, it, expect, vi } from 'vitest';

const { existsMock, mkdirMock, readDirMock, readTextFileMock, writeTextFileMock, removeMock } = vi.hoisted(() => ({
  existsMock: vi.fn(),
  mkdirMock: vi.fn(),
  readDirMock: vi.fn(),
  readTextFileMock: vi.fn(),
  writeTextFileMock: vi.fn(),
  removeMock: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-fs', () => ({
  exists: existsMock,
  mkdir: mkdirMock,
  readDir: readDirMock,
  readTextFile: readTextFileMock,
  writeTextFile: writeTextFileMock,
  remove: removeMock,
}));

const { listNoteTemplates, saveNoteTemplate, deleteNoteTemplateFile, createNoteFromTemplate } =
  await import('./noteTemplateAdapter');

describe('listNoteTemplates', () => {
  it('returns an empty list rather than an error when the templates folder does not exist yet', async () => {
    existsMock.mockResolvedValue(false);
    expect(await listNoteTemplates('/vault')).toEqual([]);
    expect(readDirMock).not.toHaveBeenCalled();
  });

  it('reads every .adoc file in the templates folder, sorted by name, skipping subfolders and other extensions', async () => {
    existsMock.mockResolvedValue(true);
    readDirMock.mockResolvedValue([
      { name: 'weekly.adoc', isDirectory: false },
      { name: 'daily.adoc', isDirectory: false },
      { name: 'notes.txt', isDirectory: false },
      { name: 'subfolder', isDirectory: true },
    ]);
    readTextFileMock.mockImplementation(async (path: string) =>
      path.endsWith('weekly.adoc') ? '= Weekly' : '= Daily',
    );

    const templates = await listNoteTemplates('/vault');

    expect(templates).toEqual([
      { name: 'daily', content: '= Daily' },
      { name: 'weekly', content: '= Weekly' },
    ]);
  });
});

describe('saveNoteTemplate', () => {
  it('creates the templates folder and writes the file', async () => {
    await saveNoteTemplate('/vault', 'weekly', '= Weekly\n');
    expect(mkdirMock).toHaveBeenCalledWith('/vault/.asciidoc-studio/templates', { recursive: true });
    expect(writeTextFileMock).toHaveBeenCalledWith('/vault/.asciidoc-studio/templates/weekly.adoc', '= Weekly\n');
  });

  it('refuses a name containing a path separator', async () => {
    await expect(saveNoteTemplate('/vault', '../escape', 'x')).rejects.toThrow('path separators');
    expect(writeTextFileMock).not.toHaveBeenCalledWith(expect.stringContaining('escape'), expect.anything());
  });
});

describe('deleteNoteTemplateFile', () => {
  it('removes the template file by name', async () => {
    await deleteNoteTemplateFile('/vault', 'weekly');
    expect(removeMock).toHaveBeenCalledWith('/vault/.asciidoc-studio/templates/weekly.adoc');
  });
});

describe('createNoteFromTemplate', () => {
  it('expands placeholders and avoids colliding with an existing sibling name', async () => {
    const path = await createNoteFromTemplate('/vault/notes', ['weekly.adoc'], {
      name: 'weekly',
      content: '= {{title}}\n:date: {{date}}\n',
    });

    expect(path).toBe('/vault/notes/weekly 1.adoc');
    expect(writeTextFileMock).toHaveBeenCalledWith(
      '/vault/notes/weekly 1.adoc',
      expect.stringContaining('= weekly 1\n:date: '),
    );
  });
});
