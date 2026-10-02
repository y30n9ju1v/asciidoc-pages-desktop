import { describe, expect, it } from 'vitest';
import { firstImageLine, lineForPreflightIssue, resolutionForPreflightIssue } from './preflightNavigationService';

describe('preflightNavigationService', () => {
  it('routes metadata and save requirements to their specific remediation flow', () => {
    expect(resolutionForPreflightIssue({ id: 'missing-title', severity: 'error', title: '', detail: '' })).toBe(
      'book-details',
    );
    expect(resolutionForPreflightIssue({ id: 'unsaved-manuscript', severity: 'error', title: '', detail: '' })).toBe(
      'save',
    );
  });

  it('locates the first image directive for image remediation', () => {
    expect(firstImageLine('= Book\n\nText\nimage::cover.png[]')).toBe(4);
  });

  it('jumps straight to an issue-carried line, ahead of the image/default heuristics', () => {
    expect(
      lineForPreflightIssue('= Book\n\nimage::cover.png[]', {
        id: 'include-missing-7',
        severity: 'error',
        title: '',
        detail: '',
        line: 7,
      }),
    ).toBe(7);
  });

  it('falls back to the image heuristic, then line 1, when an issue carries no line', () => {
    const content = '= Book\n\nText\nimage::cover.png[]';
    expect(lineForPreflightIssue(content, { id: 'remote-image', severity: 'warning', title: '', detail: '' })).toBe(4);
    expect(lineForPreflightIssue(content, { id: 'missing-title', severity: 'error', title: '', detail: '' })).toBe(1);
  });
});
