import { describe, expect, it } from 'vitest';
import { convertMarkdown } from './markdownImportService';

describe('Markdown import', () => {
  it('converts headings, links and emphasis without touching inline code', () => {
    const result = convertMarkdown('# Book\n\n**bold** [Chapter](notes/chapter.md#intro) `**literal**`');
    expect(result.content).toBe('= Book\n\n*bold* link:notes/chapter.adoc#intro[Chapter] `**literal**`');
  });
  it('retains code examples and uses a delimiter that cannot close early', () => {
    const result = convertMarkdown('```adoc\n----\n# literal\n```');
    expect(result.content).toBe('[source,adoc]\n-----\n----\n# literal\n-----');
    expect(result.warnings).toEqual([]);
  });
  it('reports features needing manual review and preserves standalone wiki links', () => {
    const result = convertMarkdown('[[Note]]\n| a | b |\n> quoted\n[^1]: footnote');
    expect(result.content).toContain('[[Note|Note]]');
    expect(result.warnings).toHaveLength(3);
  });

  it('disambiguates a standalone wiki link even with incidental surrounding whitespace', () => {
    // The destination app treats a bare, alias-less [[id]] line as an
    // AsciiDoc anchor, not a link (see asciidocProse.ts) - trailing
    // whitespace must not defeat the disambiguation that keeps an
    // Obsidian-style standalone link a real link after import.
    const result = convertMarkdown('[[Note]] \n  [[Other]]\t\n');
    expect(result.content).toContain('[[Note|Note]]');
    expect(result.content).toContain('[[Other|Other]]');
  });
});
