import { describe, expect, it } from 'vitest';
import { getPageSize } from './pageSizeService';
import { getPublicationStyle } from './publicationStyleService';
import { inspectPrintPreflight } from './printPreflightService';

describe('inspectPrintPreflight', () => {
  it('flags print layout risks without blocking a valid manuscript', () => {
    const findings = inspectPrintPreflight({
      pageSizeId: getPageSize('B5').id,
      publicationStyle: {
        ...getPublicationStyle('book-serif'),
        typst: {
          ...getPublicationStyle('book-serif').typst,
          baseFontSizePt: 9,
          lineHeight: 1.2,
          bodyJustification: false,
          chapterStartsOnNewPage: false,
        },
      },
      document: {
        version: 3,
        metadata: { title: 'Book', author: 'Writer', language: 'en' },
        diagnostics: [],
        blocks: [
          {
            type: 'section',
            id: null,
            title: 'Empty chapter',
            level: 1,
            location: { line: 1 },
            blocks: [],
          },
          {
            type: 'table',
            rows: Array.from({ length: 25 }, () => [
              { text: 'a', inlines: [{ type: 'text', value: 'a' }] },
              { text: 'b', inlines: [{ type: 'text', value: 'b' }] },
            ]),
            hasHeader: true,
            location: { line: 3 },
            caption: null,
          },
          {
            type: 'image',
            asset: { kind: 'document-relative', relativePath: 'cover.png' },
            alt: 'Cover',
            caption: null,
            location: { line: 31 },
          },
          { type: 'pageBreak', location: { line: 33 } },
        ],
      },
    });

    expect(findings.map((finding) => finding.id)).toEqual(
      expect.arrayContaining([
        'print-small-body-type',
        'print-tight-leading',
        'print-ragged-paragraphs',
        'print-continuous-chapters',
        'print-empty-section-1',
        'print-long-table-3',
        'print-uncaptioned-image-31',
        'print-trailing-page-break-33',
      ]),
    );
  });

  it('accepts a deliberately configured print style without style warnings', () => {
    const findings = inspectPrintPreflight({
      pageSizeId: 'B5',
      publicationStyle: getPublicationStyle('book-serif'),
      document: undefined,
    });

    expect(findings).toEqual([]);
  });
});
