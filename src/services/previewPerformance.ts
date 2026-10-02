export type PreviewStage = 'asciidoc-pipeline' | 'preview-assets' | 'native-pdf-roundtrip' | 'pdf-first-page';

/** Development-only timings: no manuscript, paths, or error details are logged. */
export async function measurePreviewStage<T>(stage: PreviewStage, task: () => Promise<T>): Promise<T> {
  if (!import.meta.env.DEV) return task();
  const started = performance.now();
  let succeeded = false;
  try {
    const result = await task();
    succeeded = true;
    return result;
  } finally {
    console.debug('[preview-performance]', { stage, milliseconds: Math.round(performance.now() - started), succeeded });
  }
}
