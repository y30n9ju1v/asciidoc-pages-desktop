import { describe, it, expect } from 'vitest';
import { parseOutline } from './outlineService';

describe('parseOutline', () => {
  it('returns an empty array for content with no headings', () => {
    expect(parseOutline('just some text\nno headings here')).toEqual([]);
  });

  it('extracts headings with correct levels and line numbers', () => {
    const content = '= Book Title\n\n== Chapter 1\n\n=== Section 1.1\n\ntext\n\n== Chapter 2';
    const items = parseOutline(content);

    expect(items).toHaveLength(4);
    expect(items[0]).toMatchObject({ title: 'Book Title', level: 1, lineNumber: 1 });
    expect(items[1]).toMatchObject({ title: 'Chapter 1', level: 2, lineNumber: 3 });
    expect(items[2]).toMatchObject({ title: 'Section 1.1', level: 3, lineNumber: 5 });
    expect(items[3]).toMatchObject({ title: 'Chapter 2', level: 2, lineNumber: 9 });
  });

  it('strips inline formatting, note, and indexterm markup from titles', () => {
    const content = '== *Bold* _Italic_ `code` heading footnote:[a note] endnote:[a later note] indexterm:[Term]';
    const items = parseOutline(content);

    expect(items[0].title).toBe('Bold Italic code heading');
  });

  it('ignores a bare "=" line with no title text', () => {
    // headingRegex requires at least one space + non-empty title after the =s
    expect(parseOutline('=')).toEqual([]);
  });

  it("counts words in a section's own body", () => {
    const content = '== Chapter 1\n\none two three four five';
    const items = parseOutline(content);

    expect(items[0].wordCount).toBe(5);
  });

  it("includes a subsection's words in its parent chapter's count, but stops at the next same-level heading", () => {
    const content = ['== Chapter 1', 'one two', '=== Section 1.1', 'three four five', '== Chapter 2', 'six'].join('\n');
    const items = parseOutline(content);

    expect(items[0]).toMatchObject({ title: 'Chapter 1', wordCount: 5 }); // "one two" + "three four five"
    expect(items[1]).toMatchObject({ title: 'Section 1.1', wordCount: 3 }); // "three four five"
    expect(items[2]).toMatchObject({ title: 'Chapter 2', wordCount: 1 }); // "six"
  });

  it('excludes block attribute lines, delimiters, and directive macros from the count', () => {
    const content = [
      '== Chapter 1',
      'Some prose here.',
      '[source,js]',
      '----',
      'const x = 1;',
      '----',
      'image::foo.png[Some Caption]',
      'include::other.adoc[]',
      'footnote:[a footnote worth several words]',
      'More prose after.',
    ].join('\n');
    const items = parseOutline(content);

    // "Some prose here." (3) + "const x = 1;" (still counted, listing code isn't
    // filtered out - see countWords' doc comment) (4) + "More prose after." (3)
    expect(items[0].wordCount).toBe(10);
  });

  it('returns 0 for a heading with no body text before the next heading', () => {
    const content = '== Chapter 1\n== Chapter 2\ntext';
    const items = parseOutline(content);

    expect(items[0].wordCount).toBe(0);
  });
});
