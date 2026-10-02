import { describe, expect, it } from 'vitest';
import { findBrokenCrossReferences } from './crossReferenceService';
import type { SafeBlock, SafeDocument } from './safeDocument';
import type { SafeInline } from './safeInline';

function link(target: string, isWikilink = false): SafeInline {
  return {
    type: 'link',
    target,
    children: [{ type: 'text', value: target }],
    isWikilink,
    isUnresolvedWikilink: false,
  };
}

function paragraph(inlines: SafeInline[], line: number): SafeBlock {
  return { type: 'paragraph', text: '', inlines, location: { line } };
}

function doc(blocks: SafeBlock[]): SafeDocument {
  return {
    version: 3,
    metadata: { title: 'T', author: 'A', language: 'en' },
    blocks,
    diagnostics: [],
  };
}

describe('findBrokenCrossReferences', () => {
  it('reports a reference whose target no block defines, with the enclosing line', () => {
    const document = doc([paragraph([link('#tbl-matrix')], 7)]);

    expect(findBrokenCrossReferences(document)).toEqual([{ target: 'tbl-matrix', line: 7 }]);
  });

  it('accepts a reference resolved by a block id anywhere in the document', () => {
    const document = doc([
      paragraph([link('#tbl-matrix')], 7),
      {
        type: 'table',
        id: 'tbl-matrix',
        caption: null,
        rows: [[{ text: 'a', inlines: [{ type: 'text', value: 'a' }] }]],
        hasHeader: false,
        location: { line: 20 },
      },
    ]);

    expect(findBrokenCrossReferences(document)).toEqual([]);
  });

  it('resolves against a section id and finds references nested inside a section', () => {
    const document = doc([
      {
        type: 'section',
        id: 'chapter-one',
        title: 'Chapter One',
        level: 1,
        location: { line: 1 },
        blocks: [paragraph([link('#chapter-one'), link('#missing-anchor')], 3)],
      },
    ]);

    expect(findBrokenCrossReferences(document)).toEqual([{ target: 'missing-anchor', line: 3 }]);
  });

  it('ignores wikilinks, external links, and charset-invalid fragments', () => {
    const document = doc([
      paragraph([link('#some-note', true), link('https://example.com'), link('#not a valid label')], 4),
    ]);

    expect(findBrokenCrossReferences(document)).toEqual([]);
  });

  it('reports each broken target once even when referenced repeatedly', () => {
    const document = doc([paragraph([link('#lst-publisher')], 2), paragraph([link('#lst-publisher')], 9)]);

    expect(findBrokenCrossReferences(document)).toEqual([{ target: 'lst-publisher', line: 2 }]);
  });

  it('finds a reference nested inside emphasis', () => {
    const document = doc([paragraph([{ type: 'emphasis', children: [link('#missing')] }], 5)]);

    expect(findBrokenCrossReferences(document)).toEqual([{ target: 'missing', line: 5 }]);
  });

  it('finds a reference in a rich table cell at the table line', () => {
    const document = doc([
      {
        type: 'table',
        id: null,
        caption: null,
        hasHeader: false,
        location: { line: 18 },
        rows: [[{ text: 'See missing', inlines: [link('#missing')] }]],
      },
    ]);

    expect(findBrokenCrossReferences(document)).toEqual([{ target: 'missing', line: 18 }]);
  });
});
