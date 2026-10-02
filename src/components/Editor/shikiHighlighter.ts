import * as monaco from 'monaco-editor/editor/editor.api';
import { createHighlighter } from 'shiki';
import { shikiToMonaco } from '@shikijs/monaco';
import { registerAsciidocSlashCommands } from './slashCommands';

export const asciidocLanguageId = 'asciidoc';
export const asciidocDarkThemeId = 'dark-plus';
export const asciidocLightThemeId = 'light-plus';

// Uses the same TextMate grammar VS Code's official Asciidoctor extension ships
// (bundled into Shiki as the "asciidoc" language) instead of a hand-rolled Monarch
// tokenizer, for far more complete AsciiDoc syntax coverage.
let setupPromise: Promise<void> | null = null;

export function ensureAsciidocHighlighting(): Promise<void> {
  if (!setupPromise) {
    setupPromise = (async () => {
      const highlighter = await createHighlighter({
        themes: [asciidocDarkThemeId, asciidocLightThemeId],
        langs: [asciidocLanguageId],
      });

      monaco.languages.register({ id: asciidocLanguageId });
      shikiToMonaco(highlighter, monaco);
      // Notion/Obsidian-style "/" snippet menu (table, admonitions, mermaid,
      // math, source blocks, ...) - see slashCommands.ts.
      registerAsciidocSlashCommands(asciidocLanguageId);
    })();
  }
  return setupPromise;
}
