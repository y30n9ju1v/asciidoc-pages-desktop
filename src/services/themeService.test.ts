import { describe, it, expect, beforeEach } from 'vitest';
import {
  getTheme,
  getMermaidThemeConfig,
  publicationThemeClassNames,
  loadStoredColorMode,
  storeColorMode,
  DEFAULT_THEME_ID,
  DEFAULT_COLOR_MODE,
} from './themeService';
import { getPublicationStyle } from './publicationStyleService';

describe('getTheme', () => {
  it('returns the requested theme', () => {
    expect(getTheme('literary').id).toBe('literary');
  });

  it('falls back to the default theme for an unknown id', () => {
    expect(getTheme('not-a-real-theme' as any).id).toBe(DEFAULT_THEME_ID);
  });
});

describe('getMermaidThemeConfig', () => {
  it('returns a theme-specific mermaid config for themes with custom variables', () => {
    expect(getMermaidThemeConfig('literary').theme).toBe('base');
    expect(getMermaidThemeConfig('reference').theme).toBe('neutral');
  });
});

describe('publicationThemeClassNames', () => {
  it('keeps a custom style and its selected base layout active together', () => {
    expect(
      publicationThemeClassNames({
        ...getPublicationStyle('literary'),
        id: 'custom-quiet-prose',
        name: 'Quiet prose',
        baseStyleId: 'literary',
      }),
    ).toBe('theme-custom-quiet-prose theme-literary');
  });

  it('does not duplicate a built-in style class', () => {
    expect(publicationThemeClassNames('reference')).toBe('theme-reference');
  });
});

describe('color-mode persistence', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('round-trips a valid color mode', () => {
    storeColorMode('light');
    expect(loadStoredColorMode()).toBe('light');
  });

  it('falls back to the default color mode for an invalid stored value', () => {
    localStorage.setItem('asciidoc-studio:color-mode', 'sepia');
    expect(loadStoredColorMode()).toBe(DEFAULT_COLOR_MODE);
  });
});
