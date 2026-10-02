import { describe, expect, it, vi } from 'vitest';
import { mapAsciiDocProse } from './asciidocProse';
import { inspectDocumentIntegrity } from './documentIntegrityService';
import { relocateNoteReferences } from './noteRelocationService';
import { buildBookManuscript } from './bookManuscriptService';
import { createBookProject } from './bookProjectService';
import { indexVault, type VaultCache } from './vaultService';
import { resolveWikilinkTarget, rewriteWikilinksForRender } from './wikilinkService';

describe('publication workflow boundaries', () => {
  it('does not preflight literal includes or report the line of an earlier code example', () => {
    const source = '----\ninclude::missing.adoc[]\nSee [[Missing]].\n----\nSee [[Missing]].';
    const findings = inspectDocumentIntegrity(source, '/vault/main.adoc', '/vault', []);
    expect(findings).toHaveLength(1);
    expect(findings[0].line).toBe(5);
  });
  it('preserves source blocks, anchors, inline code and comments', () => {
    const source = '[[anchor]]\n[source]\n----\n[[Code]]\n----\n// [[Comment]]\n`[[Inline]]`\nSee [[Note]].';
    const result = rewriteWikilinksForRender(source, []);
    expect(result).toContain('[[anchor]]');
    expect(result).toContain('[[Code]]');
    expect(result).toContain('`[[Inline]]`');
    expect(result).toContain('// [[Comment]]');
    expect(result).toContain('link:wikilink:Note');
    expect(mapAsciiDocProse('....\n[[X]]\n....', () => 'bad')).toBe('....\n[[X]]\n....');
  });

  const notes = [
    { path: '/vault/a/note.adoc', name: 'note', title: 'Note', content: '= Note\n\nBody' },
    { path: '/vault/b/note.adoc', name: 'note', title: 'Note', content: '= Note\n\nBody' },
  ];
  it('refuses ambiguous titles and supports qualified paths', () => {
    expect(resolveWikilinkTarget('Note', notes)).toBeNull();
    expect(resolveWikilinkTarget('b/note', notes)?.path).toBe('/vault/b/note.adoc');
  });
  it('updates references while keeping literal examples intact', () => {
    const source = {
      path: '/vault/main.adoc',
      name: 'main',
      title: 'Main',
      content: 'See [[a/note|Note]].\ninclude::a/note.adoc[]\n----\ninclude::a/note.adoc[]\n----',
    };
    const result = relocateNoteReferences(source, notes, '/vault', '/vault/a', '/vault/c');
    expect(result).toContain('[[c/note.adoc|Note]]');
    expect(result).toContain('include::c/note.adoc[]');
    expect(result).toContain('----\ninclude::a/note.adoc[]\n----');
  });
  it('assembles chapter order and rejects missing sources', () => {
    const project = createBookProject({ title: 'Book', author: 'A', lang: 'en', email: '', attributes: {} });
    project.chapters = notes.map((note) => ({ path: note.path, title: note.title, status: 'draft' }));
    const sources = [
      { ...notes[0], content: '= First\n\nimage::pic.png[]' },
      { ...notes[1], content: '= Second\n\nBody' },
    ];
    const result = buildBookManuscript(project, sources, '/vault');
    expect(result.indexOf('== First')).toBeLessThan(result.indexOf('== Second'));
    expect(result).toContain('image::a/pic.png[]');
    expect(() => buildBookManuscript(project, sources.slice(1), '/vault')).toThrow('Missing chapter');
  });
  it('reads only changed note contents after the first index', async () => {
    let fingerprint = 'first';
    const readText = vi.fn(async () => '= Note');
    const fileSystem = {
      readDirectory: async () => [{ name: 'note.adoc', isDirectory: false }],
      readText,
      fingerprint: async () => fingerprint,
    };
    const cache: VaultCache = new Map();
    await indexVault(fileSystem, '/vault', cache);
    await indexVault(fileSystem, '/vault', cache);
    expect(readText).toHaveBeenCalledTimes(1);
    fingerprint = 'second';
    await indexVault(fileSystem, '/vault', cache);
    expect(readText).toHaveBeenCalledTimes(2);
  });
});
