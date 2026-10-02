import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AsciidocRenderResult } from './asciidocService';
import type { SafeDocument } from './safeDocument';

const { messageMock } = vi.hoisted(() => ({ messageMock: vi.fn() }));
vi.mock('@tauri-apps/plugin-dialog', () => ({ message: messageMock }));

const { requireRenderedDocument } = await import('./exportGuard');

const safeDocument: SafeDocument = {
  version: 1,
  metadata: { title: 'Book', author: 'Author', language: 'en' },
  diagnostics: [],
  blocks: [],
};

describe('requireRenderedDocument', () => {
  beforeEach(() => {
    messageMock.mockReset();
  });

  it('returns the safeDocument without showing a dialog when rendering has completed', async () => {
    const renderResult: AsciidocRenderResult = {
      html: '<p>x</p>',
      meta: { title: '', author: '', email: '', lang: 'en', attributes: {} },
      safeDocument,
    };

    const result = await requireRenderedDocument(renderResult);

    expect(result).toBe(safeDocument);
    expect(messageMock).not.toHaveBeenCalled();
  });

  it('shows a contextual error dialog and returns null when the document has not rendered yet', async () => {
    const renderResult: AsciidocRenderResult = {
      html: '',
      meta: { title: '', author: '', email: '', lang: 'en', attributes: {} },
    };

    const result = await requireRenderedDocument(renderResult);

    expect(result).toBeNull();
    expect(messageMock).toHaveBeenCalledWith(
      expect.stringContaining('has not finished rendering'),
      expect.objectContaining({ kind: 'error' }),
    );
  });
});
