import { afterEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_PUBLICATION_STYLE_ID,
  getPublicationStyle,
  loadStoredPublicationStyleId,
  PUBLICATION_STYLE_LIST,
  storePublicationStyleId,
} from './publicationStyleService';

describe('publication styles', () => {
  afterEach(() => localStorage.clear());

  it('keeps screen, diagram, and Typst rules in one selected style', () => {
    const style = getPublicationStyle('literary');
    expect(style.id).toBe('literary');
    expect(style.mermaid.theme).toBe('base');
    expect(style.typst.headingNumbering).toBe(false);
    expect(style.typst.chapterStartsOnNewPage).toBe(true);
  });

  it('keeps the built-in catalog focused on the three publication workflows', () => {
    expect(PUBLICATION_STYLE_LIST.map((style) => style.id)).toEqual(['book-serif', 'literary', 'reference']);
  });

  it('persists the unified setting', () => {
    storePublicationStyleId('reference');
    expect(loadStoredPublicationStyleId()).toBe('reference');
  });

  it('migrates a retired legacy theme before its independent legacy template', () => {
    localStorage.setItem('asciidoc-studio:theme', 'editorial');
    localStorage.setItem('asciidoc-studio:publish-template', 'novel');
    expect(loadStoredPublicationStyleId()).toBe('book-serif');
  });

  it('uses the former template only when no former theme exists', () => {
    localStorage.setItem('asciidoc-studio:publish-template', 'technical-book');
    expect(loadStoredPublicationStyleId()).toBe('reference');
    localStorage.clear();
    expect(loadStoredPublicationStyleId()).toBe(DEFAULT_PUBLICATION_STYLE_ID);
  });
});
