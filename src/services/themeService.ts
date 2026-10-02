import { safeGetItem, safeSetItem } from './localStorageSafe';
import {
  DEFAULT_PUBLICATION_STYLE_ID,
  getPublicationStyle,
  type MermaidThemeConfig,
  type PublicationStyleId,
  type PublicationStyleOption,
} from './publicationStyleService';

export type ColorMode = 'dark' | 'light';
/** A full option is used for vault-defined templates; IDs retain legacy API compatibility. */
export type ThemeInput = PublicationStyleId | PublicationStyleOption;
export type ThemeOption = Pick<ReturnType<typeof getPublicationStyle>, 'id' | 'name' | 'description' | 'css'>;
export type { MermaidThemeConfig };

export const DEFAULT_THEME_ID = DEFAULT_PUBLICATION_STYLE_ID;
export const DEFAULT_COLOR_MODE: ColorMode = 'dark';

function styleForInput(input: ThemeInput): PublicationStyleOption {
  return typeof input === 'string' ? getPublicationStyle(input) : input;
}

export function getTheme(input: ThemeInput): ThemeOption {
  const { id: styleId, name, description, css } = styleForInput(input);
  return { id: styleId, name, description, css };
}

/**
 * A vault-defined style owns its accent and typography, but deliberately
 * inherits its structural rules from one of the three audited layouts. Keep
 * both classes on the rendered document: without the base class, selectors
 * such as `.theme-literary h2` never match a `theme-custom-*` document and a
 * custom Literary style silently falls back to the generic renderer.
 */
export function publicationThemeClassNames(input: ThemeInput): string {
  const style = styleForInput(input);
  const classes = [`theme-${style.id}`];
  if (style.id !== style.baseStyleId) classes.push(`theme-${style.baseStyleId}`);
  return classes.join(' ');
}

export function getMermaidThemeConfig(input: ThemeInput): MermaidThemeConfig {
  return styleForInput(input).mermaid;
}

const COLOR_MODE_STORAGE_KEY = 'asciidoc-studio:color-mode';
export function loadStoredColorMode(): ColorMode {
  const stored = safeGetItem(COLOR_MODE_STORAGE_KEY);
  return stored === 'light' || stored === 'dark' ? stored : DEFAULT_COLOR_MODE;
}
export function storeColorMode(mode: ColorMode): void {
  safeSetItem(COLOR_MODE_STORAGE_KEY, mode);
}
