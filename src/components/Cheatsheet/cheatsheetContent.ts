// Static AsciiDoc syntax reference shown in CheatsheetModal - the editor has
// no in-app help for its own markup at all, which is a real onboarding gap:
// a new user's first screen is a plain-text pane containing `:toc: left`/
// `stem:[...]`/`[source,go]` with nothing in-app explaining what any of it
// means. Ported from web-service's editor SPA (see its cheatsheetContent.ts)
// but English-only - this app has no locale system at all, unlike the SPA's
// bilingual ko/en split.
import { SLASH_COMMANDS } from '../Editor/slashCommandData';

export interface CheatsheetItem {
  syntax: string;
  description: string;
}

export interface CheatsheetSection {
  title: string;
  items: CheatsheetItem[];
}

// Generated from the same SLASH_COMMANDS list the editor's "/" autocomplete
// reads from (slashCommands.ts), rather than hand-duplicated here - a
// hand-copied list would silently drift out of sync the next time a command
// is added or renamed.
const SLASH_COMMAND_SECTION: CheatsheetSection = {
  title: 'Slash Commands',
  items: [
    { syntax: 'Type "/" at the start of a line', description: 'Opens a snippet menu for the commands below' },
    ...SLASH_COMMANDS.map((cmd) => ({ syntax: `/${cmd.command}`, description: cmd.detail })),
  ],
};

const SECTIONS: CheatsheetSection[] = [
  {
    title: 'Headings',
    items: [
      { syntax: '= Document Title', description: 'Top-level title (once per document)' },
      { syntax: '== Chapter Heading', description: 'Level 1 heading' },
      { syntax: '=== Section Heading', description: 'Level 2 heading' },
    ],
  },
  {
    title: 'Text Formatting',
    items: [
      { syntax: '*bold text*', description: 'Bold' },
      { syntax: '_italic text_', description: 'Italic' },
      { syntax: '`monospace text`', description: 'Inline code' },
      { syntax: '[.underline]#underlined#', description: 'Underline' },
    ],
  },
  {
    title: 'Lists',
    items: [
      { syntax: '* Item one\n* Item two', description: 'Bullet list' },
      { syntax: '. Step one\n. Step two', description: 'Numbered list' },
      { syntax: 'Term:: Definition', description: 'Definition list' },
    ],
  },
  {
    title: 'Links & Images',
    items: [
      { syntax: 'https://example.com[Link text]', description: 'Hyperlink' },
      { syntax: 'image::cover.png[Alt text]', description: 'Block image' },
      { syntax: 'image:icon.png[Alt text]', description: 'Inline image' },
    ],
  },
  {
    title: 'Code Blocks',
    items: [{ syntax: '[source,go]\n----\nfmt.Println("hi")\n----', description: 'Syntax-highlighted code block' }],
  },
  {
    title: 'Admonitions',
    items: [
      { syntax: 'NOTE: Worth knowing.', description: 'Note callout' },
      { syntax: 'TIP: A helpful hint.', description: 'Tip callout' },
      { syntax: 'WARNING: Be careful here.', description: 'Warning callout' },
    ],
  },
  {
    title: 'Tables',
    items: [
      {
        syntax: '|===\n| Col A | Col B\n\n| 1 | 2\n|===',
        description: 'Simple table',
      },
    ],
  },
  {
    title: 'Other',
    items: [
      { syntax: "'''", description: 'Horizontal rule' },
      { syntax: '// A comment', description: 'Comment (not rendered)' },
      { syntax: 'include::other-chapter.adoc[]', description: 'Include another file' },
    ],
  },
];

export function getCheatsheetSections(): CheatsheetSection[] {
  return [...SECTIONS, SLASH_COMMAND_SECTION];
}
