import { describe, expect, it } from 'vitest';
import { inspectPublicationQuality } from './publicationQualityService';

describe('inspectPublicationQuality', () => {
  it('flags wide tables and long code lines, including nested blocks', () => {
    const findings = inspectPublicationQuality({
      version: 1,
      metadata: { title: 'Book', author: '', language: 'en' },
      diagnostics: [],
      blocks: [
        {
          type: 'section',
          id: null,
          title: 'Chapter',
          level: 1,
          location: { line: 1 },
          blocks: [
            {
              type: 'table',
              rows: [
                [
                  ...['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((text) => ({
                    text,
                    inlines: [{ type: 'text' as const, value: text }],
                  })),
                ],
              ],
              hasHeader: false,
              location: { line: 3 },
            },
            { type: 'code', language: 'text', code: 'x'.repeat(121), location: { line: 6 } },
          ],
        },
      ],
    });
    expect(findings.map((finding) => finding.id)).toEqual(['wide-table-3', 'long-code-line-6']);
  });
});
