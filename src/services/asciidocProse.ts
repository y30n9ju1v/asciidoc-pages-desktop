// A leading list bullet/number/callout/description-term marker. AsciiDoc
// renders an indented line starting with one of these as a normal (fully
// substituted) list item, not as the implicit literal paragraph plain
// indentation otherwise triggers - see mapAsciiDocProse's own comment.
const LIST_MARKER_RE = /^(?:[*\-.]+\s|\d+[.)]\s|<\d+>\s|\S+::(\s|$))/;

/** True for a blank line, a line comment, or a standalone `[[id]]` anchor -
 * lines that are never prose regardless of indentation. */
function isPassthroughLine(trimmed: string): boolean {
  return trimmed === '' || trimmed.startsWith('//') || /^\[\[[^|\]]+\]\]$/.test(trimmed);
}

/** Whether an indented line stays literal (unprocessed), continuing the
 * same decision an already-open literal paragraph, or AsciiDoc's own rule
 * that an indented line starting a new block (right after a blank line or
 * the first line of the document) is an implicit literal paragraph unless
 * it looks like a list marker - see mapAsciiDocProse's own comment. */
function staysLiteral(trimmed: string, wasPrecededByBlank: boolean, inLiteralParagraph: boolean): boolean {
  if (inLiteralParagraph) return true;
  return wasPrecededByBlank && !LIST_MARKER_RE.test(trimmed);
}

/** Transform prose while preserving literal/source/pass/comment blocks and inline code.
 *
 * Indentation alone does not mean "literal" the way it looks like it should:
 * AsciiDoc only treats an indented line as an implicit literal paragraph
 * when it *starts* a new block (the line right before it is blank, or it's
 * the first line of the document) and doesn't look like a list marker.
 * An indented line that continues an already-open paragraph or list item -
 * a wrapped sentence, a nested bullet, a description-list body - still gets
 * full substitution from Asciidoctor, so skipping it here would silently
 * leave a wikilink/include/xref unrewritten inside every nested list item
 * and every soft-wrapped line. Verified against the real Asciidoctor.js
 * parser: a space-indented paragraph after a blank line is literal (no
 * substitution), but a space-indented list item or continuation line right
 * after one is not, even indented right after a blank line.
 */
export function mapAsciiDocProse(content: string, transform: (text: string, offset: number) => string): string {
  let delimiter: string | null = null;
  let offset = 0;
  let precededByBlank = true;
  let inLiteralParagraph = false;
  return content
    .split('\n')
    .map((line) => {
      const start = offset;
      offset += line.length + 1;
      const trimmed = line.trim();
      const wasPrecededByBlank = precededByBlank;
      precededByBlank = trimmed === '';
      if (delimiter) {
        if (trimmed === delimiter) delimiter = null;
        return line;
      }
      if (/^(?:-{4,}|\.{4,}|\+{4,}|\/{4,})$/.test(trimmed)) {
        delimiter = trimmed;
        return line;
      }
      if (isPassthroughLine(trimmed)) {
        inLiteralParagraph = false;
        return line;
      }
      const isIndented = /^\s/.test(line);
      inLiteralParagraph = isIndented && staysLiteral(trimmed, wasPrecededByBlank, inLiteralParagraph);
      if (inLiteralParagraph) return line;
      return mapInlineProse(line, start, transform);
    })
    .join('\n');
}

function mapInlineProse(line: string, start: number, transform: (text: string, offset: number) => string): string {
  let offset = start;
  return line
    .split(/(`[^`]*`|\+\+[^+]*\+\+)/g)
    .map((part, index) => {
      const position = offset;
      offset += part.length;
      return index % 2 ? part : transform(part, position);
    })
    .join('');
}

/** Keep source offsets stable so diagnostics never inspect examples as live directives. */
export function inspectableAsciiDoc(content: string): string {
  const pieces: string[] = [];
  let cursor = 0;
  mapAsciiDocProse(content, (text, offset) => {
    pieces.push(content.slice(cursor, offset).replace(/[^\r\n]/g, ' '), text);
    cursor = offset + text.length;
    return text;
  });
  pieces.push(content.slice(cursor).replace(/[^\r\n]/g, ' '));
  return pieces.join('');
}
