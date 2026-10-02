const HTML_ENTITIES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Escapes the five characters that matter for safe HTML text/attribute
 * interpolation. Shared by every exporter/renderer that builds HTML
 * strings directly (htmlExporter.ts, safeHtmlRenderer.ts, renderErrorResult.ts). */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => HTML_ENTITIES[character]);
}
