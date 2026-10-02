// Plain data + trigger-matching logic, deliberately kept free of any
// `monaco-editor` import (unlike slashCommands.ts, which registers this
// against Monaco's completion API) - the cheatsheet modal needs to list
// these commands, but the cheatsheet is loaded eagerly with the app shell
// while Monaco itself is a large lazily-loaded chunk, so importing it here
// would drag that whole chunk into the eager bundle.
export interface SlashCommand {
  /** What the user types after "/", e.g. "table" for "/table". */
  command: string;
  detail: string;
  documentation: string;
  /** Monaco snippet syntax: $1/${2:placeholder} tab stops, $0 final cursor. */
  insertText: string;
}

// Notion/Obsidian-style snippet library for AsciiDoc's more fiddly block
// syntax (table column specs, admonition delimiters, source blocks) - typing
// the full syntax from memory is the main friction point new users hit.
export const SLASH_COMMANDS: SlashCommand[] = [
  {
    command: 'table',
    detail: 'Table',
    documentation: 'Insert a 2-column AsciiDoc table.',
    insertText: '[cols="1,1"]\n|===\n| ${1:Header 1} | ${2:Header 2}\n\n| ${3:Cell 1} | ${4:Cell 2}\n|===\n$0',
  },
  {
    command: 'note',
    detail: 'NOTE admonition',
    documentation: 'Insert a NOTE callout block.',
    insertText: '[NOTE]\n====\n${1:Note text here.}\n====\n$0',
  },
  {
    command: 'tip',
    detail: 'TIP admonition',
    documentation: 'Insert a TIP callout block.',
    insertText: '[TIP]\n====\n${1:Tip text here.}\n====\n$0',
  },
  {
    command: 'warning',
    detail: 'WARNING admonition',
    documentation: 'Insert a WARNING callout block.',
    insertText: '[WARNING]\n====\n${1:Warning text here.}\n====\n$0',
  },
  {
    command: 'caution',
    detail: 'CAUTION admonition',
    documentation: 'Insert a CAUTION callout block.',
    insertText: '[CAUTION]\n====\n${1:Caution text here.}\n====\n$0',
  },
  {
    command: 'important',
    detail: 'IMPORTANT admonition',
    documentation: 'Insert an IMPORTANT callout block.',
    insertText: '[IMPORTANT]\n====\n${1:Important text here.}\n====\n$0',
  },
  {
    command: 'mermaid',
    detail: 'Mermaid diagram',
    documentation: 'Insert a Mermaid diagram source block (rendered live in the preview).',
    insertText: '[source,mermaid]\n----\ngraph TD\n    ${1:A[Start]} --> ${2:B[End]}\n----\n$0',
  },
  {
    command: 'math',
    detail: 'Math (stem) block',
    documentation: 'Insert a display-mode LaTeX math block (rendered live via KaTeX).',
    insertText: '[stem]\n++++\n${1:x^2 + y^2 = z^2}\n++++\n$0',
  },
  {
    command: 'code',
    detail: 'Source code block',
    documentation: 'Insert a syntax-highlighted source code block.',
    insertText: '[source,${1:language}]\n----\n$0\n----',
  },
  {
    command: 'image',
    detail: 'Image',
    documentation: 'Insert a block image macro.',
    insertText: 'image::${1:path/to/image.png}[${2:Alt text}]\n$0',
  },
  {
    command: 'quote',
    detail: 'Quote block',
    documentation: 'Insert an attributed quote block.',
    insertText: '[quote, ${1:Author}, ${2:Source}]\n____\n${3:Quote text}\n____\n$0',
  },
];

// Only offers commands when "/" starts the line (after optional leading
// whitespace) - matches the Notion/Obsidian convention and avoids hijacking
// "/" typed mid-sentence or inside a URL/path.
const SLASH_TRIGGER_RE = /(?:^|\s)\/([a-zA-Z-]*)$/;

/**
 * Given the text on the current line up to the cursor, reports the 1-based
 * column of the triggering "/" if the cursor is positioned to complete a
 * slash command there, or null if not (mid-sentence "/", inside a longer
 * word, etc). Pulled out of provideCompletionItems so this matching logic
 * can be unit tested without a real Monaco model/position.
 */
export function matchSlashTrigger(textUntilCursor: string): { slashColumn: number } | null {
  const match = textUntilCursor.match(SLASH_TRIGGER_RE);
  if (!match) return null;
  return { slashColumn: textUntilCursor.length - match[1].length };
}
