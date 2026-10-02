import { describe, expect, it } from 'vitest';
import {
  addBibliographyEntry,
  collectCitationKeys,
  createBibliographyEntry,
  findUnresolvedCitationKeys,
  formatBibliographyEntry,
  moveBibliographyEntry,
  removeBibliographyEntry,
  updateBibliographyEntry,
  type BibliographyEntry,
} from './bibliographyService';
import type { SafeBlock } from './safeDocument';
import type { SafeInline } from './safeInline';

describe('bibliography entry list helpers', () => {
  it('adds a new entry but refuses a duplicate key', () => {
    const first = addBibliographyEntry([], 'smith2020');
    expect(first).toEqual([createBibliographyEntry('smith2020')]);
    expect(addBibliographyEntry(first, 'smith2020')).toBe(first);
  });

  it('removes an entry by key', () => {
    const entries = [createBibliographyEntry('a'), createBibliographyEntry('b')];
    expect(removeBibliographyEntry(entries, 'a')).toEqual([createBibliographyEntry('b')]);
  });

  it('updates an entry in place by key, leaving the rest untouched', () => {
    const entries = [createBibliographyEntry('a'), createBibliographyEntry('b')];
    const updated = updateBibliographyEntry(entries, { ...createBibliographyEntry('a'), author: 'Ada' });
    expect(updated[0].author).toBe('Ada');
    expect(updated[1]).toEqual(createBibliographyEntry('b'));
  });

  it('moves an entry up or down, and is a no-op past either edge', () => {
    const entries = [createBibliographyEntry('a'), createBibliographyEntry('b'), createBibliographyEntry('c')];
    expect(moveBibliographyEntry(entries, 'b', -1).map((e) => e.key)).toEqual(['b', 'a', 'c']);
    expect(moveBibliographyEntry(entries, 'a', -1)).toBe(entries);
    expect(moveBibliographyEntry(entries, 'c', 1)).toBe(entries);
  });
});

describe('formatBibliographyEntry', () => {
  it('mirrors typst_writer.rs format_bibliography_entry exactly', () => {
    const full: BibliographyEntry = {
      key: 'k',
      author: 'Jane Smith',
      title: 'A Great Book',
      year: '2020',
      publisher: 'Acme',
      url: '',
    };
    expect(formatBibliographyEntry(full)).toBe('Jane Smith (2020). A Great Book, Acme.');

    const minimal: BibliographyEntry = {
      key: 'k',
      author: 'Jane Smith',
      title: 'A Great Book',
      year: '',
      publisher: '',
      url: '',
    };
    expect(formatBibliographyEntry(minimal)).toBe('Jane Smith. A Great Book.');
  });
});

function paragraph(inlines: SafeInline[]): SafeBlock {
  return { type: 'paragraph', text: 'x', inlines, location: { line: 1 } };
}

describe('collectCitationKeys', () => {
  it('collects distinct keys in first-appearance order, recursing into nested inline containers', () => {
    const blocks: SafeBlock[] = [
      {
        type: 'section',
        id: null,
        title: 'Ch1',
        level: 1,
        location: { line: 1 },
        blocks: [
          paragraph([
            { type: 'citation', key: 'b' },
            { type: 'strong', children: [{ type: 'citation', key: 'a' }] },
            { type: 'endnote', children: [{ type: 'citation', key: 'c' }] },
            { type: 'citation', key: 'b' },
          ]),
        ],
      },
    ];

    expect(collectCitationKeys(blocks)).toEqual(['b', 'a', 'c']);
  });

  it('finds citation keys inside list items and description lists too', () => {
    const blocks: SafeBlock[] = [
      {
        type: 'list',
        ordered: false,
        location: { line: 1 },
        items: [
          {
            text: 'x',
            inlines: [{ type: 'citation', key: 'listed' }],
            blocks: [],
            location: { line: 1 },
            checked: null,
          },
        ],
      },
      {
        type: 'descriptionList',
        location: { line: 2 },
        items: [
          {
            term: 'T',
            termInlines: [],
            descriptionText: 'D',
            descriptionInlines: [{ type: 'citation', key: 'described' }],
            descriptionBlocks: [],
            location: { line: 2 },
          },
        ],
      },
    ];

    expect(collectCitationKeys(blocks)).toEqual(['listed', 'described']);
  });

  it('finds citation keys in rich table cells', () => {
    const blocks: SafeBlock[] = [
      {
        type: 'table',
        id: null,
        caption: null,
        hasHeader: false,
        location: { line: 1 },
        rows: [[{ text: 'Source', inlines: [{ type: 'citation', key: 'table-source' }] }]],
      },
    ];

    expect(collectCitationKeys(blocks)).toEqual(['table-source']);
  });
});

describe('findUnresolvedCitationKeys', () => {
  it('reports cited keys absent from the bibliography, and nothing when every key resolves', () => {
    const blocks: SafeBlock[] = [
      paragraph([
        { type: 'citation', key: 'known' },
        { type: 'citation', key: 'unknown' },
      ]),
    ];
    const bibliography = [createBibliographyEntry('known')];

    expect(findUnresolvedCitationKeys(blocks, bibliography)).toEqual(['unknown']);
    expect(findUnresolvedCitationKeys(blocks, [...bibliography, createBibliographyEntry('unknown')])).toEqual([]);
  });
});
