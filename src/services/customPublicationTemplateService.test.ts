import { describe, expect, it } from 'vitest';
import { getPublishTemplate } from './publishTemplateService';
import {
  createCustomPublicationTemplate,
  parseCustomPublicationTemplate,
  publicationStyleFromCustomTemplate,
} from './customPublicationTemplateService';

const validInput = {
  name: '  Copper   Notes ',
  baseStyleId: 'reference' as const,
  accentColor: '#a65b2e',
  bodyFont: 'sans' as const,
  headingFont: 'serif' as const,
  baseFontSizePt: 10.5,
  lineHeight: 1.6,
  letterSpacingEm: 0.02,
  wordSpacingEm: 0.06,
  paragraphSpacingEm: 0.8,
  firstLineIndentEm: 1.1,
  headingNumbering: true,
  bodyJustification: true,
  chapterStartsOnNewPage: true,
};

describe('custom publication templates', () => {
  it('normalizes a new template and assigns a collision-free custom ID', () => {
    const template = createCustomPublicationTemplate(validInput, ['book-serif', 'custom-copper-notes']);

    expect(template.id).toBe('custom-copper-notes-2');
    expect(template.name).toBe('Copper Notes');
  });

  it('rejects untrusted fields instead of treating a vault file as CSS or Typst input', () => {
    expect(
      parseCustomPublicationTemplate({
        version: 1,
        id: 'custom-unsafe',
        ...validInput,
        name: 'Unsafe',
        accentColor: 'red; background: url(https://example.test)',
      }),
    ).toBeNull();
    expect(
      parseCustomPublicationTemplate({
        version: 1,
        id: 'custom-unbounded-spacing',
        ...validInput,
        name: 'Unbounded spacing',
        letterSpacingEm: 100,
      }),
    ).toBeNull();
  });

  it('keeps a custom template within its selected built-in Typst family', () => {
    const template = createCustomPublicationTemplate(validInput, []);
    const style = publicationStyleFromCustomTemplate(template);
    const publishTemplate = getPublishTemplate(style);

    expect(style.mermaid.themeVariables?.lineColor).toBe('#a65b2e');
    expect(style.css).toContain('--publication-accent: #a65b2e');
    expect(publishTemplate.id).toBe('reference');
    expect(publishTemplate.baseFontSizePt).toBe(10.5);
    expect(publishTemplate.letterSpacingEm).toBe(0.02);
    expect(publishTemplate.wordSpacingEm).toBe(0.06);
    expect(publishTemplate.paragraphSpacingEm).toBe(0.8);
    expect(publishTemplate.firstLineIndentEm).toBe(1.1);
    expect(publishTemplate.bodyJustification).toBe(true);
    expect(publishTemplate.chapterStartsOnNewPage).toBe(true);
    expect(style.css).toContain('letter-spacing: 0.02em');
    expect(style.css).toContain('word-spacing: 0.06em');
    expect(style.css).toContain('margin: 0 0 0.8em');
    expect(style.css).toContain('text-indent: 1.1em');
    // Every base theme sets text-align on ".asciidoc-preview-container.theme-*"
    // (two classes); a single-class override here would always lose that
    // comparison regardless of source order and leave justify inert.
    expect(style.css).toContain('.asciidoc-preview-container.asciidoc-preview-container { text-align:');
  });

  it('keeps older vault templates usable by applying the base style print defaults', () => {
    const parsed = parseCustomPublicationTemplate({
      version: 1,
      id: 'custom-existing',
      ...validInput,
      name: 'Existing',
      description: 'Existing saved style',
      bodyJustification: undefined,
      chapterStartsOnNewPage: undefined,
      letterSpacingEm: undefined,
      wordSpacingEm: undefined,
      paragraphSpacingEm: undefined,
      firstLineIndentEm: undefined,
    });

    expect(parsed).toEqual(
      expect.objectContaining({
        bodyJustification: false,
        chapterStartsOnNewPage: false,
        letterSpacingEm: 0,
        wordSpacingEm: 0,
        paragraphSpacingEm: 0.8,
        firstLineIndentEm: 0,
      }),
    );
  });
});
