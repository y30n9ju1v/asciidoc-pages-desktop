/** A clean in-memory document is not necessarily a file saved on disk. */
export function documentSaveStatus(path: string | null, dirty: boolean): string {
  if (!path) return 'Not saved';
  return dirty ? 'Edited' : 'Saved';
}
