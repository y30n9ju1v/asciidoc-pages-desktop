import { basenameOf, normalizePath } from './pathSafety';

const HISTORY_DIRECTORY = '.asciidoc-studio/history';
const MAX_DOCUMENT_SNAPSHOTS = 30;

export interface DocumentSnapshot {
  path: string;
  createdAt: string;
}

function relativeToVault(vaultRoot: string, documentPath: string): string | null {
  const root = normalizePath(vaultRoot);
  const path = normalizePath(documentPath);
  if (!path.startsWith(`${root}/`)) return null;
  return path.slice(root.length + 1);
}

// encodeURIComponent over the whole relative path (not per segment joined by
// a literal separator) keeps this collision-free: two different relative
// paths can never encode to the same key, since decodeURIComponent is a left
// inverse of encodeURIComponent for every string. A per-segment "__" join
// isn't safe here - encodeURIComponent leaves "_" untouched, so
// "notes__x/y.adoc" and "notes/x__y.adoc" would both flatten to the same
// "notes__x__y.adoc" key and share one document's history with another's.
function historyKey(relativePath: string): string {
  return encodeURIComponent(relativePath);
}

export function documentHistoryDirectory(vaultRoot: string | null, documentPath: string | null): string | null {
  if (!vaultRoot || !documentPath) return null;
  const relativePath = relativeToVault(vaultRoot, documentPath);
  if (!relativePath || relativePath.startsWith('.asciidoc-studio/')) return null;
  return `${normalizePath(vaultRoot)}/${HISTORY_DIRECTORY}/${historyKey(relativePath)}`;
}

export function snapshotFileName(createdAt: Date): string {
  return `${createdAt.toISOString().replace(/[:.]/g, '-')}.adoc`;
}

export function snapshotCreatedAt(path: string): string | null {
  const base = basenameOf(path).replace(/\.adoc$/, '');
  const match = base.match(/^(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2})-(\d{3})Z(?:-[a-z\d-]+)?$/i);
  return match ? `${match[1].replace(/(\d{2})-(\d{2})-(\d{2})$/, '$1:$2:$3')}.${match[2]}Z` : null;
}

export function keepLatestSnapshots(snapshots: DocumentSnapshot[]): DocumentSnapshot[] {
  return [...snapshots]
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, MAX_DOCUMENT_SNAPSHOTS);
}
