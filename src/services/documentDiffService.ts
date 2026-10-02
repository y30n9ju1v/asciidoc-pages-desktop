export interface DocumentDiff {
  unchangedBefore: number;
  removed: string[];
  added: string[];
  unchangedAfter: number;
}

/** A bounded, readable line diff for the version-history dialog. It isolates
 * the changed middle between common prefix/suffix instead of using a costly
 * full LCS matrix on book-length manuscripts. */
export function compareDocumentLines(previous: string, current: string): DocumentDiff {
  const before = previous.split(/\r?\n/);
  const after = current.split(/\r?\n/);
  let prefix = 0;
  while (prefix < before.length && prefix < after.length && before[prefix] === after[prefix]) prefix += 1;

  let suffix = 0;
  while (
    suffix < before.length - prefix &&
    suffix < after.length - prefix &&
    before[before.length - 1 - suffix] === after[after.length - 1 - suffix]
  ) {
    suffix += 1;
  }
  return {
    unchangedBefore: prefix,
    removed: before.slice(prefix, before.length - suffix),
    added: after.slice(prefix, after.length - suffix),
    unchangedAfter: suffix,
  };
}
