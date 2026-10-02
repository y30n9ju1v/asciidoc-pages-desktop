import { message } from '@tauri-apps/plugin-dialog';
import type { AsciidocRenderResult } from './asciidocService';
import type { SafeDocument } from './safeDocument';

/**
 * Returns the document's SafeDocument once rendering has completed, or
 * shows a contextual error dialog and returns null otherwise. Exists so
 * PublishDialog.tsx (a component) never imports a Tauri plugin directly -
 * DESIGN_GUIDELINES.md §2 reserves Tauri/DOM/Worker calls for the thinnest
 * possible boundary, not the component layer; every other Tauri-adjacent
 * export action here already goes through a services/*Exporter.ts function
 * the same way.
 *
 * Not expected to actually return null once Preflight reports ready
 * (rendering always populates safeDocument, success or failure) - but
 * AsciidocRenderResult.safeDocument is typed optional for external render
 * adapters, so this can't just be a silent no-op without breaking the
 * "failures get a contextual message" UI guideline.
 */
export async function requireRenderedDocument(renderResult: AsciidocRenderResult): Promise<SafeDocument | null> {
  if (renderResult.safeDocument) return renderResult.safeDocument;
  await message('The document has not finished rendering yet. Please try again in a moment.', {
    title: 'Export Failed',
    kind: 'error',
  });
  return null;
}
