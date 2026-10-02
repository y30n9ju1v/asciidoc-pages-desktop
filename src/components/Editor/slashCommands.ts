import * as monaco from 'monaco-editor/editor/editor.api';
import { SLASH_COMMANDS, matchSlashTrigger } from './slashCommandData';

export type { SlashCommand } from './slashCommandData';
export { SLASH_COMMANDS, matchSlashTrigger } from './slashCommandData';

let registered = false;

export function registerAsciidocSlashCommands(languageId: string): void {
  if (registered) return;
  registered = true;

  monaco.languages.registerCompletionItemProvider(languageId, {
    triggerCharacters: ['/'],
    provideCompletionItems(model, position) {
      const textUntilCursor = model.getValueInRange({
        startLineNumber: position.lineNumber,
        startColumn: 1,
        endLineNumber: position.lineNumber,
        endColumn: position.column,
      });

      const trigger = matchSlashTrigger(textUntilCursor);
      if (!trigger) {
        return { suggestions: [] };
      }

      const range = new monaco.Range(position.lineNumber, trigger.slashColumn, position.lineNumber, position.column);

      const suggestions: monaco.languages.CompletionItem[] = SLASH_COMMANDS.map((cmd) => ({
        label: `/${cmd.command}`,
        kind: monaco.languages.CompletionItemKind.Snippet,
        detail: cmd.detail,
        documentation: cmd.documentation,
        insertText: cmd.insertText,
        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
        filterText: `/${cmd.command}`,
        sortText: cmd.command,
        range,
      }));

      return { suggestions };
    },
  });
}
