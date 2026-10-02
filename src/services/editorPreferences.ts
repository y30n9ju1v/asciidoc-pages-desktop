import { safeGetItem, safeSetItem } from './localStorageSafe';

const VIM_MODE_STORAGE_KEY = 'asciidoc-studio:vim-mode';
const EDITOR_FONT_SIZE_STORAGE_KEY = 'asciidoc-studio:editor-font-size';

export const MIN_EDITOR_FONT_SIZE = 12;
export const MAX_EDITOR_FONT_SIZE = 22;
export const DEFAULT_EDITOR_FONT_SIZE = 14;

export function loadVimModeEnabled(): boolean {
  return safeGetItem(VIM_MODE_STORAGE_KEY) === 'true';
}

export function storeVimModeEnabled(enabled: boolean): void {
  safeSetItem(VIM_MODE_STORAGE_KEY, String(enabled));
}

/** Keeps Monaco readable without letting one preference make its UI unusable. */
export function clampEditorFontSize(size: number): number {
  return Math.min(Math.max(Math.round(size), MIN_EDITOR_FONT_SIZE), MAX_EDITOR_FONT_SIZE);
}

export function loadEditorFontSize(): number {
  const rawValue = safeGetItem(EDITOR_FONT_SIZE_STORAGE_KEY);
  if (rawValue === null) return DEFAULT_EDITOR_FONT_SIZE;
  const stored = Number(rawValue);
  return Number.isFinite(stored) ? clampEditorFontSize(stored) : DEFAULT_EDITOR_FONT_SIZE;
}

export function storeEditorFontSize(size: number): void {
  safeSetItem(EDITOR_FONT_SIZE_STORAGE_KEY, String(clampEditorFontSize(size)));
}
