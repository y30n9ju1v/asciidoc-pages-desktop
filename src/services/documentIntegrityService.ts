import { dirnameOf, normalizePath, resolveWithinRoot } from './pathSafety';
import { extractWikilinks, resolveWikilinkTarget } from './wikilinkService';
import type { VaultNote } from './vaultService';
import { inspectableAsciiDoc } from './asciidocProse';

export interface IntegrityFinding {
  id: string;
  severity: 'error' | 'warning';
  title: string;
  detail: string;
  line: number;
}

const INCLUDE_RE = /^include::([^[]+)\[.*\]$/gm;

function lineAt(content: string, index: number): number {
  return content.slice(0, index).split(/\r?\n/).length;
}

function includeFindings(content: string, currentPath: string, notes: VaultNote[]): IntegrityFinding[] {
  const root = dirnameOf(currentPath);
  if (!root) return [];
  const notePaths = new Set(notes.map((note) => normalizePath(note.path)));
  const findings: IntegrityFinding[] = [];
  for (const match of content.matchAll(INCLUDE_RE)) {
    const target = match[1].trim();
    const line = lineAt(content, match.index ?? 0);
    const resolved = resolveWithinRoot(root, target, root);
    if (!resolved) {
      findings.push({
        id: `include-outside-root-${line}`,
        severity: 'error',
        title: 'Include escapes the document folder',
        detail: `"${target}" resolves outside this document's folder and will not be published.`,
        line,
      });
    } else if (normalizePath(resolved) === normalizePath(currentPath)) {
      findings.push({
        id: `include-recursive-${line}`,
        severity: 'error',
        title: 'Recursive include',
        detail: `"${target}" includes this document itself.`,
        line,
      });
    } else if (!notePaths.has(normalizePath(resolved))) {
      findings.push({
        id: `include-missing-${line}`,
        severity: 'error',
        title: 'Included document is missing',
        detail: `"${target}" cannot be found inside the open Vault.`,
        line,
      });
    }
  }
  return findings;
}

function wikilinkFindings(content: string, notes: VaultNote[]): IntegrityFinding[] {
  const findings: IntegrityFinding[] = [];
  let searchFrom = 0;
  for (const link of extractWikilinks(content)) {
    const index = content.indexOf(link.raw, searchFrom);
    searchFrom = index + link.raw.length;
    if (resolveWikilinkTarget(link.target, notes)) continue;
    const line = lineAt(content, index);
    findings.push({
      id: `wikilink-unresolved-${line}-${link.target}`,
      severity: 'warning',
      title: 'Linked note is missing',
      detail: `[[${link.target}]] does not resolve to a note in the open Vault.`,
      line,
    });
  }
  return findings;
}

/** Checks only relationships that can be proved from the already-indexed
 * Vault. No file I/O occurs here, keeping publication preflight deterministic. */
export function inspectDocumentIntegrity(
  content: string,
  currentPath: string | null,
  vaultRoot: string | null,
  notes: VaultNote[],
): IntegrityFinding[] {
  if (!currentPath || !vaultRoot) return [];
  const prose = inspectableAsciiDoc(content);
  return [...includeFindings(prose, currentPath, notes), ...wikilinkFindings(prose, notes)];
}
