import { describe, expect, it } from 'vitest';
import { coverAssetReferences, extractErrorCode, publicationOptionsFromMeta } from './typstPublishing';

describe('extractErrorCode', () => {
  it('preserves a structured native error code for a recovery action', () => {
    expect(
      extractErrorCode({ code: 'asset-outside-allowed-root', message: 'Folder access is required.', line: null }),
    ).toBe('asset-outside-allowed-root');
  });

  it('does not infer a code from an ordinary error message', () => {
    expect(extractErrorCode(new Error('asset-outside-allowed-root'))).toBeNull();
  });
});

describe('publicationOptionsFromMeta', () => {
  const meta = {
    title: 'Book',
    author: 'Author',
    email: '',
    lang: 'ko',
    attributes: {
      toclevels: '3',
      'figure-caption': '그림',
      'table-caption': '표',
      'example-caption': '예시',
      'front-cover-image': 'images/front.jpg',
      'back-cover-image': '../../outside.jpg',
    },
  };

  it('normalizes only bounded layout attributes and document-relative cover assets', () => {
    expect(publicationOptionsFromMeta(meta)).toEqual({
      tocDepth: 3,
      figureCaption: '그림',
      tableCaption: '표',
      exampleCaption: '예시',
    });
    expect(coverAssetReferences(meta)).toEqual([{ kind: 'document-relative', relativePath: 'images/front.jpg' }]);
  });

  it('uses safe defaults for malformed layout attributes', () => {
    expect(
      publicationOptionsFromMeta({ ...meta, attributes: { toclevels: '99', 'figure-caption': 'x'.repeat(81) } }),
    ).toEqual({ tocDepth: 3, figureCaption: 'Figure', tableCaption: 'Table', exampleCaption: 'Example' });
  });
});
