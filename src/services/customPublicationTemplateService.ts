import {
  getPublicationStyle,
  type BuiltInPublicationStyleId,
  type FontRole,
  type PublicationStyleId,
  type PublicationStyleOption,
} from './publicationStyleService';

export const CUSTOM_PUBLICATION_TEMPLATES_DIRECTORY = '.asciidoc-studio/rendering-templates';
const TEMPLATE_VERSION = 1;
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export interface CustomPublicationTemplate {
  version: typeof TEMPLATE_VERSION;
  id: `custom-${string}`;
  name: string;
  description: string;
  baseStyleId: BuiltInPublicationStyleId;
  accentColor: string;
  bodyFont: FontRole;
  headingFont: FontRole;
  baseFontSizePt: number;
  lineHeight: number;
  letterSpacingEm: number;
  wordSpacingEm: number;
  paragraphSpacingEm: number;
  firstLineIndentEm: number;
  headingNumbering: boolean;
  bodyJustification: boolean;
  chapterStartsOnNewPage: boolean;
}

export interface CreateCustomPublicationTemplateInput {
  name: string;
  baseStyleId: BuiltInPublicationStyleId;
  accentColor: string;
  bodyFont: FontRole;
  headingFont: FontRole;
  baseFontSizePt: number;
  lineHeight: number;
  letterSpacingEm: number;
  wordSpacingEm: number;
  paragraphSpacingEm: number;
  firstLineIndentEm: number;
  headingNumbering: boolean;
  bodyJustification: boolean;
  chapterStartsOnNewPage: boolean;
}

function normalizedName(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function templateSlug(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'style'
  );
}

function isBuiltInStyleId(value: unknown): value is BuiltInPublicationStyleId {
  return value === 'book-serif' || value === 'literary' || value === 'reference';
}

function isFontRole(value: unknown): value is FontRole {
  return value === 'serif' || value === 'sans';
}

function isFiniteNumberInRange(value: unknown, minimum: number, maximum: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= minimum && value <= maximum;
}

function isTemplateRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

function hasValidTypographySettings(candidate: Record<string, unknown>): boolean {
  return [
    isFiniteNumberInRange(candidate.baseFontSizePt, 8, 18),
    isFiniteNumberInRange(candidate.lineHeight, 1.1, 2.2),
    candidate.letterSpacingEm === undefined || isFiniteNumberInRange(candidate.letterSpacingEm, -0.05, 0.15),
    candidate.wordSpacingEm === undefined || isFiniteNumberInRange(candidate.wordSpacingEm, -0.1, 0.3),
    candidate.paragraphSpacingEm === undefined || isFiniteNumberInRange(candidate.paragraphSpacingEm, 0, 2),
    candidate.firstLineIndentEm === undefined || isFiniteNumberInRange(candidate.firstLineIndentEm, 0, 2.5),
  ].every(Boolean);
}

function hasValidTemplateFields(candidate: Record<string, unknown>): boolean {
  return [
    candidate.version === TEMPLATE_VERSION,
    typeof candidate.id === 'string' && /^custom-[a-z0-9-]{1,80}$/.test(candidate.id),
    typeof candidate.name === 'string' &&
      normalizedName(candidate.name).length > 0 &&
      normalizedName(candidate.name).length <= 80,
    typeof candidate.description === 'string' && candidate.description.length <= 180,
    isBuiltInStyleId(candidate.baseStyleId),
    typeof candidate.accentColor === 'string' && HEX_COLOR.test(candidate.accentColor),
    isFontRole(candidate.bodyFont),
    isFontRole(candidate.headingFont),
    hasValidTypographySettings(candidate),
    typeof candidate.headingNumbering === 'boolean',
    // These settings were introduced after the initial template file
    // format. Existing vault templates inherit their base layout defaults.
    candidate.bodyJustification === undefined || typeof candidate.bodyJustification === 'boolean',
    candidate.chapterStartsOnNewPage === undefined || typeof candidate.chapterStartsOnNewPage === 'boolean',
  ].every(Boolean);
}

/** Validates data read from a vault. No raw CSS, font name, or Typst source
 * is accepted: users can configure only the intentionally supported visual
 * controls below. */
export function parseCustomPublicationTemplate(value: unknown): CustomPublicationTemplate | null {
  if (!isTemplateRecord(value) || !hasValidTemplateFields(value)) return null;
  const candidate = value;
  const baseStyle = getPublicationStyle(candidate.baseStyleId as BuiltInPublicationStyleId);
  return {
    version: TEMPLATE_VERSION,
    id: candidate.id as `custom-${string}`,
    name: normalizedName(candidate.name as string),
    description: (candidate.description as string).trim(),
    baseStyleId: candidate.baseStyleId as BuiltInPublicationStyleId,
    accentColor: candidate.accentColor as string,
    bodyFont: candidate.bodyFont as FontRole,
    headingFont: candidate.headingFont as FontRole,
    baseFontSizePt: candidate.baseFontSizePt as number,
    lineHeight: candidate.lineHeight as number,
    letterSpacingEm: (candidate.letterSpacingEm as number | undefined) ?? baseStyle.typst.letterSpacingEm,
    wordSpacingEm: (candidate.wordSpacingEm as number | undefined) ?? baseStyle.typst.wordSpacingEm,
    paragraphSpacingEm: (candidate.paragraphSpacingEm as number | undefined) ?? baseStyle.typst.paragraphSpacingEm,
    firstLineIndentEm: (candidate.firstLineIndentEm as number | undefined) ?? baseStyle.typst.firstLineIndentEm,
    headingNumbering: candidate.headingNumbering as boolean,
    bodyJustification: (candidate.bodyJustification as boolean | undefined) ?? baseStyle.typst.bodyJustification,
    chapterStartsOnNewPage:
      (candidate.chapterStartsOnNewPage as boolean | undefined) ?? baseStyle.typst.chapterStartsOnNewPage,
  };
}

export function createCustomPublicationTemplate(
  input: CreateCustomPublicationTemplateInput,
  existingIds: readonly PublicationStyleId[],
): CustomPublicationTemplate {
  const name = normalizedName(input.name);
  const parsed = parseCustomPublicationTemplate({
    version: TEMPLATE_VERSION,
    id: 'custom-pending',
    description: `Custom ${getPublicationStyle(input.baseStyleId).name} rendering style`,
    ...input,
    name,
  });
  if (!parsed) throw new Error('Rendering template contains an invalid setting.');

  const occupied = new Set(existingIds);
  const baseId = `custom-${templateSlug(name)}`;
  let id = baseId;
  for (let suffix = 2; occupied.has(id as PublicationStyleId); suffix += 1) id = `${baseId}-${suffix}`;
  return { ...parsed, id: id as `custom-${string}` };
}

/** Turns safe, serializable user settings into the same full contract used by
 * built-in styles. Generated CSS only uses validated colors and fixed boolean branches. */
export function publicationStyleFromCustomTemplate(template: CustomPublicationTemplate): PublicationStyleOption {
  const base = getPublicationStyle(template.baseStyleId);
  const accentCss = `
/* User rendering template accent: validated #rrggbb only. */
.asciidoc-preview-container { --publication-accent: ${template.accentColor}; }
.asciidoc-preview-container a,
.asciidoc-preview-container .sidebarblock a { color: var(--publication-accent); }
.asciidoc-preview-container h1,
.asciidoc-preview-container h2,
.asciidoc-preview-container h3 { border-color: color-mix(in srgb, var(--publication-accent) 42%, transparent); }
.asciidoc-preview-container .admonitionblock td.icon { color: var(--publication-accent); }
/* Doubled class: a single-class selector here loses to each base theme's own
   ".asciidoc-preview-container.theme-*" container rule regardless of source
   order, leaving this justify toggle inert in HTML and EPUB output. */
.asciidoc-preview-container.asciidoc-preview-container { text-align: ${template.bodyJustification ? 'justify' : 'left'}; }
.asciidoc-preview-container .paragraph > p,
.asciidoc-preview-container .quoteblock blockquote,
.asciidoc-preview-container .admonitionblock td.content,
.asciidoc-preview-container .ulist,
.asciidoc-preview-container .olist,
.asciidoc-preview-container .dlist { letter-spacing: ${template.letterSpacingEm}em; word-spacing: ${template.wordSpacingEm}em; }
.asciidoc-preview-container .paragraph > p { margin: 0 0 ${template.paragraphSpacingEm}em; text-indent: ${template.firstLineIndentEm}em; }
${template.chapterStartsOnNewPage ? '.asciidoc-preview-container .sect1 + .sect1 { break-before: page; }' : ''}
`;
  return {
    id: template.id,
    name: template.name,
    description: template.description || `Custom ${base.name} rendering style`,
    css: `${base.css}\n${accentCss}`,
    mermaid: {
      ...base.mermaid,
      themeVariables: {
        ...base.mermaid.themeVariables,
        primaryBorderColor: template.accentColor,
        lineColor: template.accentColor,
      },
    },
    typst: {
      bodyFont: template.bodyFont,
      headingFont: template.headingFont,
      baseFontSizePt: template.baseFontSizePt,
      lineHeight: template.lineHeight,
      letterSpacingEm: template.letterSpacingEm,
      wordSpacingEm: template.wordSpacingEm,
      paragraphSpacingEm: template.paragraphSpacingEm,
      firstLineIndentEm: template.firstLineIndentEm,
      headingNumbering: template.headingNumbering,
      bodyJustification: template.bodyJustification,
      chapterStartsOnNewPage: template.chapterStartsOnNewPage,
    },
    baseStyleId: template.baseStyleId,
    accentColor: template.accentColor,
  };
}
