export function previewStatusText(
  enabled: boolean,
  preview: { error: string | null; isCompiling: boolean; phase: string },
  pendingInput: boolean,
): string {
  if (!enabled) return 'Preview paused';
  if (pendingInput) return 'Preview pending';
  if (preview.error) return 'Preview failed';
  if (preview.isCompiling) return 'Generating PDF…';
  return preview.phase === 'ready' ? 'PDF up to date' : 'Preview pending';
}
export function hasPublicationChanges(layoutChanged: boolean, typographyChanged: boolean): boolean {
  return layoutChanged || typographyChanged;
}
export function publicationTarget(root: string | null, title: string | undefined): string {
  if (!root) return 'App defaults';
  return title || 'New book';
}
