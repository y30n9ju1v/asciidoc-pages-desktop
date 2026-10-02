import type { PublicationStyleOption } from './publicationStyleService';

/** The safe, user-adjustable subset of a publication style's print layout. */
export interface PublicationTypography {
  baseFontSizePt: number;
  lineHeight: number;
  letterSpacingEm: number;
  wordSpacingEm: number;
  paragraphSpacingEm: number;
  firstLineIndentEm: number;
  bodyJustification: boolean;
  chapterStartsOnNewPage: boolean;
}

export type PublicationTypographyField = keyof PublicationTypography;

interface NumericTypographyRange {
  minimum: number;
  maximum: number;
  step: number;
}

export const PUBLICATION_TYPOGRAPHY_RANGES = {
  baseFontSizePt: { minimum: 8, maximum: 18, step: 0.5 },
  lineHeight: { minimum: 1.1, maximum: 2.2, step: 0.1 },
  letterSpacingEm: { minimum: -0.05, maximum: 0.15, step: 0.01 },
  wordSpacingEm: { minimum: -0.1, maximum: 0.3, step: 0.01 },
  paragraphSpacingEm: { minimum: 0, maximum: 2, step: 0.1 },
  firstLineIndentEm: { minimum: 0, maximum: 2.5, step: 0.1 },
} as const satisfies Record<
  Exclude<PublicationTypographyField, 'bodyJustification' | 'chapterStartsOnNewPage'>,
  NumericTypographyRange
>;

const PROSE_SELECTORS = [
  '.asciidoc-preview-container .paragraph > p',
  '.asciidoc-preview-container .quoteblock blockquote',
  '.asciidoc-preview-container .admonitionblock td.content',
  '.asciidoc-preview-container .ulist',
  '.asciidoc-preview-container .olist',
  '.asciidoc-preview-container .dlist',
].join(',\n');

function clamp(value: number, range: NumericTypographyRange): number {
  return Math.min(range.maximum, Math.max(range.minimum, value));
}

function numericTypography(
  value: number,
  field: Exclude<PublicationTypographyField, 'bodyJustification' | 'chapterStartsOnNewPage'>,
): number {
  const range = PUBLICATION_TYPOGRAPHY_RANGES[field];
  return Number.isFinite(value) ? clamp(value, range) : range.minimum;
}

/** Extracts a serializable adjustment model without exposing arbitrary CSS or Typst. */
export function typographyFromPublicationStyle(style: PublicationStyleOption): PublicationTypography {
  return {
    baseFontSizePt: style.typst.baseFontSizePt,
    lineHeight: style.typst.lineHeight,
    letterSpacingEm: style.typst.letterSpacingEm,
    wordSpacingEm: style.typst.wordSpacingEm,
    paragraphSpacingEm: style.typst.paragraphSpacingEm,
    firstLineIndentEm: style.typst.firstLineIndentEm,
    bodyJustification: style.typst.bodyJustification,
    chapterStartsOnNewPage: style.typst.chapterStartsOnNewPage,
  };
}

/** Rejects invalid UI or future persisted values before they reach an output writer. */
export function normalizePublicationTypography(value: PublicationTypography): PublicationTypography {
  return {
    baseFontSizePt: numericTypography(value.baseFontSizePt, 'baseFontSizePt'),
    lineHeight: numericTypography(value.lineHeight, 'lineHeight'),
    letterSpacingEm: numericTypography(value.letterSpacingEm, 'letterSpacingEm'),
    wordSpacingEm: numericTypography(value.wordSpacingEm, 'wordSpacingEm'),
    paragraphSpacingEm: numericTypography(value.paragraphSpacingEm, 'paragraphSpacingEm'),
    firstLineIndentEm: numericTypography(value.firstLineIndentEm, 'firstLineIndentEm'),
    bodyJustification: value.bodyJustification === true,
    chapterStartsOnNewPage: value.chapterStartsOnNewPage === true,
  };
}

function typographyCss(typography: PublicationTypography): string {
  return `
/* Publication typography: safe numeric values only. This is emitted for
   defaults as well as live adjustments, so HTML/EPUB and PDF share one
   style contract instead of carrying unrelated screen defaults.
   The doubled class raises specificity to match each base theme's own
   ".asciidoc-preview-container.theme-*" container rule - a single-class
   selector here would silently lose to it regardless of source order,
   leaving body size/line height/justify inert in HTML and EPUB output. */
.asciidoc-preview-container.asciidoc-preview-container { font-size: ${typography.baseFontSizePt}pt; line-height: ${typography.lineHeight}; text-align: ${typography.bodyJustification ? 'justify' : 'left'}; }
${PROSE_SELECTORS} { letter-spacing: ${typography.letterSpacingEm}em; word-spacing: ${typography.wordSpacingEm}em; }
.asciidoc-preview-container .paragraph > p { margin-bottom: ${typography.paragraphSpacingEm}em; text-indent: ${typography.firstLineIndentEm}em; }
${typography.chapterStartsOnNewPage ? '.asciidoc-preview-container .sect1 + .sect1 { break-before: page; }' : ''}
`;
}

/** Applies constrained layout settings to the same style contract used by preview and every exporter. */
export function withPublicationTypography(
  style: PublicationStyleOption,
  requestedTypography: PublicationTypography,
): PublicationStyleOption {
  const typography = normalizePublicationTypography(requestedTypography);
  return {
    ...style,
    css: `${style.css}\n${typographyCss(typography)}`,
    typst: {
      ...style.typst,
      ...typography,
    },
  };
}

/**
 * Applies the selected style's own defaults before optional live controls.
 * This is intentionally not conditional: previously only a moved slider
 * injected the typography CSS, leaving HTML/EPUB on unrelated theme CSS
 * defaults while the PDF used the selected style's Typst values.
 */
export function publicationStyleWithCurrentTypography(
  style: PublicationStyleOption,
  typographyOverride: PublicationTypography | null,
): PublicationStyleOption {
  return withPublicationTypography(style, typographyOverride ?? typographyFromPublicationStyle(style));
}

/** Provides the displayed values whether they come from the style or a live adjustment. */
export function currentPublicationTypography(
  style: PublicationStyleOption,
  typographyOverride: PublicationTypography | null,
): PublicationTypography {
  return typographyOverride ?? typographyFromPublicationStyle(style);
}

/** Compares a persisted proofing override without relying on object identity. */
export function isSamePublicationTypography(
  left: PublicationTypography | null,
  right: PublicationTypography | null,
): boolean {
  if (left === right) return true;
  if (left === null || right === null) return false;
  return Object.keys(left).every((key) => {
    const field = key as PublicationTypographyField;
    return left[field] === right[field];
  });
}
