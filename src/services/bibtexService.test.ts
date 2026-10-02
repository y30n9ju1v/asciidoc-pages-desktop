import { describe, expect, it } from 'vitest';
import { addImportedBibliographyEntries, parseBibtex } from './bibtexService';

describe('BibTeX bibliography import', () => {
  it('imports nested-brace values and maps common academic fields', () => {
    const result = parseBibtex(`@article{knuth1984,
      author = {Knuth, Donald E.},
      title = {Literate {Programming}},
      year = {1984},
      journal = {The Computer Journal},
      doi = {10.1093/comjnl/27.2.97}
    }`);

    expect(result).toEqual({
      skippedCount: 0,
      entries: [
        {
          key: 'knuth1984',
          author: 'Knuth, Donald E.',
          title: 'Literate Programming',
          year: '1984',
          publisher: 'The Computer Journal',
          url: 'https://doi.org/10.1093/comjnl/27.2.97',
        },
      ],
    });
  });

  it('ignores metadata and malformed/duplicate keys without losing valid entries', () => {
    const result = parseBibtex(`@string{abbr = "Journal"}
      @book{valid_1, title = "A book"}
      @book{valid_1, title = "Duplicate"}
      @book{bad key, title = "Ignored"}`);

    expect(result.entries.map((entry) => entry.key)).toEqual(['valid_1']);
    expect(result.skippedCount).toBe(2);
  });

  it('never overwrites a project entry during import', () => {
    const existing = [{ key: 'source', author: 'Edited author', title: '', year: '', publisher: '', url: '' }];
    const imported = [
      { key: 'source', author: 'Imported author', title: '', year: '', publisher: '', url: '' },
      { key: 'new-source', author: '', title: '', year: '', publisher: '', url: '' },
    ];
    expect(addImportedBibliographyEntries(existing, imported)).toEqual([existing[0], imported[1]]);
  });
});
