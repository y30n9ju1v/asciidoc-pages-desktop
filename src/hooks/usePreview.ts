import { useEffect, useState } from 'react';
import type { AsciidocRenderResult } from '../services/asciidocService';
import { BibliographyEntry } from '../services/bibliographyService';
import { renderDocumentPreview } from '../services/renderPipeline';
import { errorRenderResult } from '../services/renderErrorResult';
import { VaultNote } from '../services/vaultService';
import { measurePreviewStage } from '../services/previewPerformance';

const RENDER_DEBOUNCE_MS = 250;
const RENDER_TIMEOUT_MS = 15_000;

const EMPTY_RENDER_RESULT: AsciidocRenderResult = {
  html: '',
  meta: { title: 'Untitled Document', author: '', email: '', lang: 'en', attributes: {} },
};

async function renderWithTimeout(
  content: string,
  currentPath: string | null,
  notes: VaultNote[],
  bibliography: BibliographyEntry[],
): Promise<AsciidocRenderResult> {
  let timeoutId: number | undefined;
  try {
    return await Promise.race([
      measurePreviewStage('asciidoc-pipeline', () =>
        renderDocumentPreview({ content, currentPath, notes, bibliography }),
      ),
      new Promise<never>((_, reject) => {
        timeoutId = window.setTimeout(
          () => reject(new Error('AsciiDoc rendering timed out after 15 seconds.')),
          RENDER_TIMEOUT_MS,
        );
      }),
    ]);
  } finally {
    if (timeoutId !== undefined) window.clearTimeout(timeoutId);
  }
}

/** Converts document state to preview state without leaking render scheduling into App. */
export function usePreview(
  content: string,
  currentPath: string | null,
  notes: VaultNote[],
  bibliography: BibliographyEntry[],
): AsciidocRenderResult {
  const [renderResult, setRenderResult] = useState<AsciidocRenderResult>(EMPTY_RENDER_RESULT);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      setRenderResult((current) => ({ ...current, isPending: true }));
      void renderWithTimeout(content, currentPath, notes, bibliography)
        .then((result) => {
          if (cancelled) return;
          setRenderResult(result);
        })
        .catch((error) => {
          if (cancelled) return;
          console.error('Preview render failed:', error);
          // Include resolution and image adaptation happen after Asciidoctor,
          // so their failures used to leave the previous empty result in
          // place forever. Consumers such as the PDF preview then had no way
          // to distinguish "still rendering" from "render failed".
          setRenderResult(errorRenderResult(error));
        });
    }, RENDER_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [content, currentPath, notes, bibliography]);

  return renderResult;
}
