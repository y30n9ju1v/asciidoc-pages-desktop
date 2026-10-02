import { describe, expect, it } from 'vitest';
import type { AsciidocRenderResult } from './asciidocService';
import { buildTypstPreviewRequest } from './typstPreviewRequest';

const renderResult: AsciidocRenderResult = {
  html: '<p>Chapter</p>',
  meta: { title: 'Manuscript', author: 'Writer', email: '', lang: 'ko', attributes: {} },
  safeDocument: {
    version: 1,
    metadata: { title: 'Manuscript', author: 'Writer', language: 'ko' },
    diagnostics: [],
    blocks: [],
  },
};

describe('buildTypstPreviewRequest', () => {
  it('builds the native contract from prepared data without filesystem or IPC work', () => {
    const request = buildTypstPreviewRequest({
      renderResult,
      docPath: '/books/guide/main.adoc',
      templateId: 'manuscript',
      pageSizeId: 'B5',
      bookMetadata: {
        title: 'Published Book',
        subtitle: 'A subtitle',
        author: 'Book Author',
        language: '',
        identifier: '',
        publisher: 'Studio',
        description: '',
        rights: '',
        subjects: [],
        bibliography: [],
      },
      assets: [{ path: 'images/cover.png', resolvedPath: '/books/guide/images/cover.png', mediaType: 'image/png' }],
    });

    expect(request).toMatchObject({
      document: { metadata: { title: 'Published Book', author: 'Book Author', language: 'ko' } },
      template: { id: 'manuscript' },
      pageSize: { id: 'B5' },
      cover: { title: 'Published Book', subtitle: 'A subtitle', author: 'Book Author', publisher: 'Studio' },
      assets: [{ path: 'images/cover.png' }],
      documentRoot: '/books/guide',
      pdfA: false,
    });
  });

  it('refuses an unrendered document before any native command can be called', () => {
    expect(() =>
      buildTypstPreviewRequest({
        renderResult: { ...renderResult, safeDocument: undefined },
        docPath: null,
        templateId: 'manuscript',
        pageSizeId: 'B5',
        bookMetadata: {
          title: '',
          subtitle: '',
          author: '',
          language: '',
          identifier: '',
          publisher: '',
          description: '',
          rights: '',
          subjects: [],
          bibliography: [],
        },
        assets: [],
      }),
    ).toThrow('not ready');
  });
});
