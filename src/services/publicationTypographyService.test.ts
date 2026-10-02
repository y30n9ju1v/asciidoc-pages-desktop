import { describe, expect, it } from 'vitest';
import { getPublicationStyle } from './publicationStyleService';
import {
  normalizePublicationTypography,
  isSamePublicationTypography,
  publicationStyleWithCurrentTypography,
  typographyFromPublicationStyle,
  withPublicationTypography,
} from './publicationTypographyService';

describe('publication typography', () => {
  it('keeps the deliberately different defaults for each native publication style', () => {
    expect(typographyFromPublicationStyle(getPublicationStyle('book-serif'))).toMatchObject({
      baseFontSizePt: 10.5,
      lineHeight: 1.7,
      wordSpacingEm: 0.01,
      paragraphSpacingEm: 0,
      firstLineIndentEm: 1.25,
      bodyJustification: true,
      chapterStartsOnNewPage: true,
    });
    expect(typographyFromPublicationStyle(getPublicationStyle('literary'))).toMatchObject({
      baseFontSizePt: 11,
      lineHeight: 1.8,
      letterSpacingEm: 0.005,
      wordSpacingEm: 0.01,
      paragraphSpacingEm: 0,
      firstLineIndentEm: 1.4,
      bodyJustification: true,
      chapterStartsOnNewPage: true,
    });
    expect(typographyFromPublicationStyle(getPublicationStyle('reference'))).toMatchObject({
      baseFontSizePt: 10,
      lineHeight: 1.6,
      paragraphSpacingEm: 0.8,
      firstLineIndentEm: 0,
      bodyJustification: false,
      chapterStartsOnNewPage: false,
    });
  });

  it('clamps untrusted numeric settings to the supported publishing ranges', () => {
    expect(
      normalizePublicationTypography({
        baseFontSizePt: 100,
        lineHeight: Number.NaN,
        letterSpacingEm: -1,
        wordSpacingEm: 1,
        paragraphSpacingEm: 3,
        firstLineIndentEm: -1,
        bodyJustification: false,
        chapterStartsOnNewPage: true,
      }),
    ).toEqual({
      baseFontSizePt: 18,
      lineHeight: 1.1,
      letterSpacingEm: -0.05,
      wordSpacingEm: 0.3,
      paragraphSpacingEm: 2,
      firstLineIndentEm: 0,
      bodyJustification: false,
      chapterStartsOnNewPage: true,
    });
  });

  it('changes both the Typst contract and safe preview CSS', () => {
    const style = withPublicationTypography(getPublicationStyle('book-serif'), {
      ...typographyFromPublicationStyle(getPublicationStyle('book-serif')),
      letterSpacingEm: 0.02,
      wordSpacingEm: 0.05,
      paragraphSpacingEm: 0.8,
      firstLineIndentEm: 1.2,
      bodyJustification: false,
    });

    expect(style.typst.letterSpacingEm).toBe(0.02);
    expect(style.typst.bodyJustification).toBe(false);
    expect(style.css).toContain('letter-spacing: 0.02em');
    expect(style.css).toContain('text-indent: 1.2em');
    expect(style.css).toContain('text-align: left');
  });

  it('emits the container rule at a specificity that beats a base theme .theme-* selector', () => {
    // Every base theme sets font-size/line-height/text-align on
    // ".asciidoc-preview-container.theme-*" (two classes). A single-class
    // ".asciidoc-preview-container" rule always loses that comparison
    // regardless of source order, so this override must match or exceed it.
    const style = withPublicationTypography(
      getPublicationStyle('literary'),
      typographyFromPublicationStyle(getPublicationStyle('literary')),
    );
    expect(style.css).toContain('.asciidoc-preview-container.asciidoc-preview-container { font-size:');
  });

  it('applies a selected style default to rendered outputs even before an adjustment', () => {
    const style = publicationStyleWithCurrentTypography(getPublicationStyle('literary'), null);

    expect(style.typst).toMatchObject({
      baseFontSizePt: 11,
      lineHeight: 1.8,
      paragraphSpacingEm: 0,
      firstLineIndentEm: 1.4,
    });
    expect(style.css).toContain('font-size: 11pt');
    expect(style.css).toContain('line-height: 1.8');
    expect(style.css).toContain('text-indent: 1.4em');
  });

  it('compares persisted proofing settings by value, not object identity', () => {
    const typography = typographyFromPublicationStyle(getPublicationStyle('book-serif'));
    expect(isSamePublicationTypography(typography, { ...typography })).toBe(true);
    expect(isSamePublicationTypography(typography, { ...typography, lineHeight: 1.8 })).toBe(false);
    expect(isSamePublicationTypography(null, null)).toBe(true);
  });
});
