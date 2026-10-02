/** Note templates live inside the same hidden dotfolder as Book Project
 * settings (.asciidoc-studio/), just a different subfolder - see
 * bookProjectService.ts's BOOK_PROJECT_DIRECTORY, and pathSafety.ts's
 * IGNORED_DIR_ENTRY_NAMES, which already excludes the whole
 * .asciidoc-studio/ tree from both the file explorer and indexVault's note
 * walk, so template files never show up as ordinary notes. */
export const TEMPLATES_DIRECTORY = '.asciidoc-studio/templates';

export interface NoteTemplate {
  /** Filename stem (no ".adoc"), also the template's display name. */
  name: string;
  content: string;
}

const PLACEHOLDER_RE = /\{\{\s*(title|date)\s*\}\}/g;

/**
 * Expands {{title}}/{{date}} placeholders in template content - the same
 * two variables Obsidian's own core Templates plugin ships by default, kept
 * to that minimal set rather than a full template-expression language.
 */
export function applyTemplatePlaceholders(content: string, vars: { title: string; date: string }): string {
  return content.replace(PLACEHOLDER_RE, (_match, name: 'title' | 'date') => vars[name]);
}

export function isoDateToday(): string {
  return new Date().toISOString().split('T')[0];
}
