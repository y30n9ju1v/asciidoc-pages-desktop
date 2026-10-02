import type { PreflightIssue } from './preflightService';

export type PreflightResolution = 'save' | 'book-details' | 'editor' | 'open-folder';

const BOOK_DETAILS_ISSUES = new Set(['missing-title', 'missing-author', 'missing-identifier', 'missing-description']);
const IMAGE_ISSUES = new Set(['local-file-url', 'remote-image', 'missing-alt-text']);

export function resolutionForPreflightIssue(issue: PreflightIssue): PreflightResolution {
  if (issue.id === 'unsaved-manuscript') return 'save';
  if (issue.id === 'pdf-images-need-open-folder') return 'open-folder';
  if (BOOK_DETAILS_ISSUES.has(issue.id)) return 'book-details';
  return 'editor';
}

export function firstImageLine(content: string): number {
  const lines = content.split(/\r?\n/);
  const index = lines.findIndex((line) => /^image::/i.test(line.trim()));
  return index === -1 ? 1 : index + 1;
}

export function lineForPreflightIssue(content: string, issue: PreflightIssue): number {
  if (issue.line) return issue.line;
  return IMAGE_ISSUES.has(issue.id) ? firstImageLine(content) : 1;
}

export function resolutionLabel(resolution: PreflightResolution): string {
  if (resolution === 'save') return 'Save manuscript';
  if (resolution === 'book-details') return 'Open book details';
  if (resolution === 'open-folder') return 'Open folder';
  return 'Review in editor';
}
