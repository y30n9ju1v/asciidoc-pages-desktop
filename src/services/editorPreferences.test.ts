import { describe, expect, it, vi } from 'vitest';

const { safeGetItemMock, safeSetItemMock } = vi.hoisted(() => ({
  safeGetItemMock: vi.fn(),
  safeSetItemMock: vi.fn(),
}));

vi.mock('./localStorageSafe', () => ({ safeGetItem: safeGetItemMock, safeSetItem: safeSetItemMock }));

import {
  DEFAULT_EDITOR_FONT_SIZE,
  MAX_EDITOR_FONT_SIZE,
  MIN_EDITOR_FONT_SIZE,
  clampEditorFontSize,
  loadEditorFontSize,
  storeEditorFontSize,
} from './editorPreferences';

describe('editor font preferences', () => {
  it('clamps values to the supported reading-size range', () => {
    expect(clampEditorFontSize(MIN_EDITOR_FONT_SIZE - 1)).toBe(MIN_EDITOR_FONT_SIZE);
    expect(clampEditorFontSize(MAX_EDITOR_FONT_SIZE + 1)).toBe(MAX_EDITOR_FONT_SIZE);
    expect(clampEditorFontSize(15.6)).toBe(16);
  });

  it('uses the default for unavailable or malformed stored preferences', () => {
    safeGetItemMock.mockReturnValueOnce(null).mockReturnValueOnce('large');

    expect(loadEditorFontSize()).toBe(DEFAULT_EDITOR_FONT_SIZE);
    expect(loadEditorFontSize()).toBe(DEFAULT_EDITOR_FONT_SIZE);
  });

  it('normalizes persisted values before storing them', () => {
    storeEditorFontSize(MAX_EDITOR_FONT_SIZE + 4);

    expect(safeSetItemMock).toHaveBeenCalledWith('asciidoc-studio:editor-font-size', String(MAX_EDITOR_FONT_SIZE));
  });
});
