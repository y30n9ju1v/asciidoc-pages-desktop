import type { AsciidocRenderResult } from './asciidocService';
import { failedSafeDocument } from './safeDocument';
import { escapeHtml } from './htmlEscape';

/** Creates a renderer-independent error result without loading Asciidoctor. */
export function errorRenderResult(error: unknown): AsciidocRenderResult {
  const message = error instanceof Error ? error.message : String(error);
  return {
    html: `<div style="color: #ff6b6b; padding: 20px; font-family: sans-serif;"><h3>Syntax or Processing Error</h3><pre>${escapeHtml(message)}</pre></div>`,
    meta: { title: 'Error', author: '', email: '', lang: 'en', attributes: {} },
    safeDocument: failedSafeDocument({ title: 'Error', author: '', language: 'en' }),
    renderError: message,
  };
}
