import bookSerifCss from '../styles/themes/book-serif.css?raw';
import literaryCss from '../styles/themes/literary.css?raw';
import referenceCss from '../styles/themes/reference.css?raw';
import { safeGetItem, safeSetItem } from './localStorageSafe';

/** A complete visual and typographic contract for every publication output. */
export type BuiltInPublicationStyleId = 'book-serif' | 'literary' | 'reference';
/** IDs written by the rendering-template editor. Keeping this namespace
 * separate prevents a vault file from impersonating an internal preset. */
export type PublicationStyleId = BuiltInPublicationStyleId | `custom-${string}`;
export type FontRole = 'serif' | 'sans';

export interface MermaidThemeConfig {
  theme: 'default' | 'forest' | 'dark' | 'neutral' | 'base';
  themeVariables?: Record<string, string>;
}

export interface PublicationStyleOption {
  id: PublicationStyleId;
  name: string;
  description: string;
  css: string;
  mermaid: MermaidThemeConfig;
  typst: {
    bodyFont: FontRole;
    headingFont: FontRole;
    baseFontSizePt: number;
    lineHeight: number;
    /** Tracking applied to prose in print and web exports, in em. */
    letterSpacingEm: number;
    /** Extra spacing between words in prose, in em. */
    wordSpacingEm: number;
    /** Space after a prose paragraph, in em. */
    paragraphSpacingEm: number;
    /** First-line indent for prose paragraphs, in em. */
    firstLineIndentEm: number;
    headingNumbering: boolean;
    /** A print-facing paragraph policy, shared by preview and native PDF. */
    bodyJustification: boolean;
    /** Starts each top-level chapter on a fresh page in print outputs. */
    chapterStartsOnNewPage: boolean;
  };
  /** The vetted Typst layout family a custom style may configure. */
  baseStyleId: BuiltInPublicationStyleId;
  /** Optional, validated custom accent propagated to the native PDF writer. */
  accentColor?: string;
}

export const DEFAULT_PUBLICATION_STYLE_ID: PublicationStyleId = 'book-serif';

export const PUBLICATION_STYLES: Record<BuiltInPublicationStyleId, PublicationStyleOption> = {
  'book-serif': {
    id: 'book-serif',
    name: 'Book Serif',
    description: 'Classic nonfiction with numbered chapters and indented prose',
    css: bookSerifCss,
    mermaid: {
      theme: 'neutral',
      themeVariables: {
        primaryColor: '#f7f3eb',
        primaryTextColor: '#302a25',
        primaryBorderColor: '#746a5d',
        lineColor: '#746a5d',
        fontFamily: 'Iowan Old Style, Georgia, serif',
      },
    },
    typst: {
      bodyFont: 'serif',
      headingFont: 'serif',
      // A traditional, dense-but-readable nonfiction page: paragraphs carry
      // the rhythm with an indent, not blog-like vertical gaps.
      baseFontSizePt: 10.5,
      lineHeight: 1.7,
      letterSpacingEm: 0,
      wordSpacingEm: 0.01,
      paragraphSpacingEm: 0,
      firstLineIndentEm: 1.25,
      headingNumbering: true,
      bodyJustification: true,
      chapterStartsOnNewPage: true,
    },
    baseStyleId: 'book-serif',
  },
  literary: {
    id: 'literary',
    name: 'Literary',
    description: 'An immersive literary edition for novels, memoirs, and essays',
    css: literaryCss,
    mermaid: {
      theme: 'base',
      themeVariables: {
        primaryColor: '#f5f1e8',
        primaryTextColor: '#28251f',
        primaryBorderColor: '#7a6a54',
        lineColor: '#7a6a54',
        tertiaryColor: '#fffdf8',
        fontFamily: 'Iowan Old Style, Georgia, serif',
      },
    },
    typst: {
      bodyFont: 'serif',
      headingFont: 'serif',
      baseFontSizePt: 11,
      // Airier leading and a deeper first-line indent make this a calm
      // long-form reading page rather than a generic book preset.
      lineHeight: 1.8,
      letterSpacingEm: 0.005,
      wordSpacingEm: 0.01,
      paragraphSpacingEm: 0,
      firstLineIndentEm: 1.4,
      headingNumbering: false,
      bodyJustification: true,
      chapterStartsOnNewPage: true,
    },
    baseStyleId: 'literary',
  },
  reference: {
    id: 'reference',
    name: 'Reference',
    description: 'A scan-friendly technical edition for manuals and knowledge guides',
    css: referenceCss,
    mermaid: {
      theme: 'neutral',
      themeVariables: {
        primaryColor: '#f0f7f5',
        primaryTextColor: '#18332f',
        primaryBorderColor: '#24756a',
        lineColor: '#24756a',
      },
    },
    typst: {
      bodyFont: 'sans',
      headingFont: 'sans',
      baseFontSizePt: 10,
      // Technical material benefits from visible paragraph grouping and a
      // ragged right edge that avoids rivers around identifiers and code.
      lineHeight: 1.6,
      letterSpacingEm: 0,
      wordSpacingEm: 0,
      paragraphSpacingEm: 0.8,
      firstLineIndentEm: 0,
      headingNumbering: true,
      bodyJustification: false,
      chapterStartsOnNewPage: false,
    },
    baseStyleId: 'reference',
  },
};

export const PUBLICATION_STYLE_LIST = Object.values(PUBLICATION_STYLES);

export function getPublicationStyle(id: string): PublicationStyleOption {
  return (
    PUBLICATION_STYLES[id as BuiltInPublicationStyleId] ??
    PUBLICATION_STYLES[DEFAULT_PUBLICATION_STYLE_ID as BuiltInPublicationStyleId]
  );
}

function isPublicationStyleId(value: string): value is PublicationStyleId {
  return value in PUBLICATION_STYLES || /^custom-[a-z0-9-]{1,80}$/.test(value);
}

const STYLE_STORAGE_KEY = 'asciidoc-studio:publication-style';
const LEGACY_THEME_STORAGE_KEY = 'asciidoc-studio:theme';
const LEGACY_TEMPLATE_STORAGE_KEY = 'asciidoc-studio:publish-template';

function legacyTemplateStyle(): PublicationStyleId | null {
  switch (safeGetItem(LEGACY_TEMPLATE_STORAGE_KEY)) {
    case 'novel':
      return 'literary';
    case 'technical-book':
      return 'reference';
    case 'manuscript':
      return 'book-serif';
    default:
      return null;
  }
}

function legacyThemeStyle(): PublicationStyleId | null {
  switch (safeGetItem(LEGACY_THEME_STORAGE_KEY)) {
    case 'literary':
      return 'literary';
    case 'reference':
    case 'web-reading':
      return 'reference';
    case 'book-serif':
    case 'editorial':
      return 'book-serif';
    default:
      return null;
  }
}

/** Reads the new setting first and transparently migrates pre-unification preferences. */
export function loadStoredPublicationStyleId(): PublicationStyleId {
  const stored = safeGetItem(STYLE_STORAGE_KEY);
  if (stored && isPublicationStyleId(stored)) return stored;
  return legacyThemeStyle() ?? legacyTemplateStyle() ?? DEFAULT_PUBLICATION_STYLE_ID;
}

export function storePublicationStyleId(id: PublicationStyleId): void {
  safeSetItem(STYLE_STORAGE_KEY, id);
}
