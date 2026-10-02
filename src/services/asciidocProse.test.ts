import { describe, expect, it } from 'vitest';
import { mapAsciiDocProse } from './asciidocProse';

/** Marks every prose segment the transform sees, so a test can assert
 * exactly which parts of the content were/weren't visited. */
function markProse(content: string): string {
  return mapAsciiDocProse(content, (text) => (text ? `<<${text}>>` : text));
}

describe('mapAsciiDocProse', () => {
  it('transforms an ordinary top-level paragraph', () => {
    expect(markProse('Hello world.')).toBe('<<Hello world.>>');
  });

  it('does not touch an indented paragraph that starts a new block (an implicit literal paragraph)', () => {
    // Real AsciiDoc/Asciidoctor renders this as a <pre> literal block with
    // no substitution applied - skipping it here matches that, not an
    // arbitrary choice.
    expect(markProse('Paragraph.\n\n  Indented text.\n')).toBe('<<Paragraph.>>\n\n  Indented text.\n');
  });

  it('keeps every line of a multi-line implicit literal paragraph untouched', () => {
    const content = 'Paragraph.\n\n  Line one.\n  Line two.\n';
    expect(markProse(content)).toBe('<<Paragraph.>>\n\n  Line one.\n  Line two.\n');
  });

  it('does not treat the very first line of the document as a continuation', () => {
    expect(markProse('  Indented from line one.')).toBe('  Indented from line one.');
  });

  it('still transforms a nested list item even though it is indented', () => {
    // Asciidoctor renders a nested bullet's content as a fully-substituted
    // paragraph, not a literal block - a blanket indentation check would
    // wrongly treat every nested list item as literal. (The leading
    // whitespace rides along inside the transformed segment - transform()
    // receives the whole line, not line content split from its indent.)
    expect(markProse('* Item\n  ** Nested item\n')).toBe('<<* Item>>\n<<  ** Nested item>>\n');
  });

  it('still transforms an indented continuation line of a list item', () => {
    expect(markProse('* Item\n  wrapped continuation text\n')).toBe('<<* Item>>\n<<  wrapped continuation text>>\n');
  });

  it('still transforms a second indented continuation line in the same run', () => {
    expect(markProse('* Item\n  first line\n  second line\n')).toBe(
      '<<* Item>>\n<<  first line>>\n<<  second line>>\n',
    );
  });

  it('still transforms a space-indented bullet marker even right after a blank line', () => {
    // A blank line alone does not make the next indented line literal -
    // Asciidoctor still recognizes *, -, ., a digit marker, or a term::
    // as a real list/description item.
    expect(markProse('Paragraph.\n\n  * bullet\n')).toBe('<<Paragraph.>>\n\n<<  * bullet>>\n');
  });

  it('transforms a description list term and description line', () => {
    expect(markProse('Term:: Description text\n')).toBe('<<Term:: Description text>>\n');
  });

  it('skips a line comment', () => {
    expect(markProse('// not prose\nReal prose.')).toBe('// not prose\n<<Real prose.>>');
  });

  it('skips the body of a delimited literal/listing/pass/comment block', () => {
    expect(markProse('----\nraw content\n----\n')).toBe('----\nraw content\n----\n');
  });

  it('resumes transforming prose right after a delimited block closes', () => {
    expect(markProse('----\nraw\n----\nAfter.\n')).toBe('----\nraw\n----\n<<After.>>\n');
  });

  it('skips inline code and passthrough spans but transforms the surrounding text', () => {
    expect(markProse('Before `code` after.')).toBe('<<Before >>`code`<< after.>>');
  });

  it('skips a standalone [[id]]-only line (an AsciiDoc anchor) but still transforms the next line', () => {
    expect(markProse('[[anchor-id]]\nReal prose.')).toBe('[[anchor-id]]\n<<Real prose.>>');
  });

  it('still transforms a line with [[target|alias]] even alone on its own line', () => {
    expect(markProse('[[target|alias]]')).toBe('<<[[target|alias]]>>');
  });
});
