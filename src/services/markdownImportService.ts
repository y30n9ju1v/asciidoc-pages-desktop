export interface MarkdownConversion {
  content: string;
  warnings: string[];
}

function inlineMarkdown(text: string): string {
  return text
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, 'image:$2[$1]')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_raw, label: string, target: string) => {
      const converted = target.replace(/\.md(?=#|$)/i, '.adoc');
      return `link:${converted}[${label}]`;
    })
    .replace(/\*\*([^*]+)\*\*/g, '*$1*');
}

function convertProseLine(line: string, index: number, warnings: string[]): string {
  if (/^\||^---$|^>|<\/?[a-z]|\[\^|!\[\[/.test(line)) {
    warnings.push(`Line ${index + 1}: review table, metadata, quote, HTML, footnote or embedded-note syntax.`);
  }
  const heading = /^(#{1,6})\s+(.+)$/.exec(line);
  if (heading) return `${'='.repeat(heading[1].length)} ${heading[2]}`;
  // Must match asciidocProse.ts's own standalone-[[id]]-line test (it trims
  // before testing) - otherwise a line with incidental leading/trailing
  // whitespace keeps its bare Markdown [[Note]] form, which the importing
  // app then reads as a silent AsciiDoc anchor instead of the link the
  // Obsidian-style source clearly meant.
  if (/^\[\[[^|\]]+\]\]$/.test(line.trim())) return line.replace(/\[\[([^\]]+)\]\]/, '[[$1|$1]]');
  return line
    .split(/(`[^`]*`)/g)
    .map((part, i) => (i % 2 ? part : inlineMarkdown(part)))
    .join('')
    .replace(/^- /, '* ');
}

function closesFence(match: RegExpExecArray | null, fence: string): boolean {
  return Boolean(match && match[2][0] === fence[0] && match[2].length >= fence.length && !match[3].trim());
}

/** Conservative import; original Markdown is retained by the adapter for comparison. */
export function convertMarkdown(source: string): MarkdownConversion {
  const warnings: string[] = [];
  let fence: string | null = null;
  const delimiter = '-'.repeat(Math.max(4, ...Array.from(source.matchAll(/^-+$/gm), (match) => match[0].length + 1)));
  const lines = source.split(/\r?\n/).map((line, index) => {
    const match = /^(\s*)(`{3,}|~{3,})(.*)$/.exec(line);
    if (fence) {
      if (closesFence(match, fence)) {
        fence = null;
        return delimiter;
      }
      return line;
    }
    if (match) {
      fence = match[2];
      return `[source,${match[3].trim().replace(/[^\w+-]/g, '')}]\n${delimiter}`;
    }
    return convertProseLine(line, index, warnings);
  });
  if (fence) {
    lines.push(delimiter);
    warnings.push('Unclosed code fence was closed.');
  }
  return { content: lines.join('\n'), warnings };
}
