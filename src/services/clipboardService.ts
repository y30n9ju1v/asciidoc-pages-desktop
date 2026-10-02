/**
 * Copies plain text through the platform clipboard without making callers
 * depend on a browser global or on clipboard permission details.
 */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) return false;

  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
