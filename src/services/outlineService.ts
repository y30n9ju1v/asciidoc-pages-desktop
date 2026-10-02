export interface OutlineItem {
  id: string;
  title: string;
  level: number;
  lineNumber: number;
  /** Word count of this section's own body text, plus every subsection nested under it. */
  wordCount: number;
}

interface HeadingMatch {
  title: string;
  level: number;
  lineIndex: number;
}

const HEADING_REGEX = /^(=+)\s+(.+)$/;
// Block attribute lines (`[source,js]`, `[#id]`, `[stem]`, ...) and delimiter lines
// (`----`, `....`, `++++`, table `|===`) are structural markup, not prose.
const NON_PROSE_LINE_REGEX = /^(\[.*\]|-{4,}|\.{4,}|\+{4,}|\|={3,})$/;

function parseHeadings(lines: string[]): HeadingMatch[] {
  const headings: HeadingMatch[] = [];

  lines.forEach((line, index) => {
    const match = line.trim().match(HEADING_REGEX);
    if (!match) return;

    const level = match[1].length; // '=': 1, '==': 2, '===': 3 ...
    // Clean up inline formatting markup if any (e.g. *bold*, _italic_, `code`)
    const title = match[2]
      .trim()
      .replace(/[*_`]/g, '')
      .replace(/indexterm:\[.*?\]/g, '')
      .replace(/footnote:\[.*?\]/g, '')
      .replace(/endnote:\[.*?\]/g, '')
      .trim();

    headings.push({ title, level, lineIndex: index });
  });

  return headings;
}

/**
 * Approximate prose word count for a chunk of AsciiDoc source: strips block
 * attribute/delimiter lines, `include::`/`image::` directives, and footnote/endnote/
 * indexterm macros, then splits the rest on whitespace. This is a progress
 * indicator for the author, not an exact count - code inside listing blocks is
 * intentionally still counted (skipping it would need full block-type tracking
 * for a marginal accuracy gain).
 */
function countWords(bodyLines: string[]): number {
  const prose = bodyLines
    .filter((line) => {
      const trimmed = line.trim();
      // A parent chapter's range includes its subsections' heading lines too
      // (e.g. "=== Section 1.1") - already surfaced as their own outline entries,
      // so they'd otherwise get double-counted into the parent's total.
      return !NON_PROSE_LINE_REGEX.test(trimmed) && !HEADING_REGEX.test(trimmed);
    })
    .join('\n')
    .replace(/^include::.*$/gm, '')
    .replace(/image::[^[]*\[[^\]]*\]/g, '')
    .replace(/footnote:\[[^\]]*\]/g, '')
    .replace(/endnote:\[[^\]]*\]/g, '')
    .replace(/indexterm:\[[^\]]*\]/g, '');

  const tokens = prose.trim().split(/\s+/).filter(Boolean);
  return tokens.length;
}

/**
 * Parses an AsciiDoc document content line by line and extracts heading sections
 * (= Title, == Section, === SubSection, etc.) along with their line numbers and
 * an approximate word count for each section (including its subsections' text,
 * up to the next heading of the same or higher level).
 */
export function parseOutline(content: string): OutlineItem[] {
  if (!content) return [];

  const lines = content.split(/\r?\n/);
  const headings = parseHeadings(lines);

  return headings.map((heading, index) => {
    let endLineIndex = lines.length;
    for (let j = index + 1; j < headings.length; j++) {
      if (headings[j].level <= heading.level) {
        endLineIndex = headings[j].lineIndex;
        break;
      }
    }

    return {
      id: `heading-${heading.lineIndex + 1}-${heading.level}`,
      title: heading.title,
      level: heading.level,
      lineNumber: heading.lineIndex + 1,
      wordCount: countWords(lines.slice(heading.lineIndex + 1, endLineIndex)),
    };
  });
}
