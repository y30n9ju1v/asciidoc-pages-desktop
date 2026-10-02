/** Updates an open descendant when its containing folder is moved or renamed. */
export function remapOpenDocumentPath(openPath: string | null, oldPath: string, newPath: string): string | null {
  if (!openPath) return openPath;
  if (openPath === oldPath) return newPath;
  return openPath.startsWith(`${oldPath}/`) ? `${newPath}${openPath.slice(oldPath.length)}` : openPath;
}

/** True when a deletion removes the open file itself or one of its parents. */
export function isOpenDocumentDeleted(openPath: string | null, deletedPath: string): boolean {
  return openPath === deletedPath || openPath?.startsWith(`${deletedPath}/`) === true;
}
