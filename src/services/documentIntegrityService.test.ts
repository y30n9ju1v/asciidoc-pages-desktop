import { describe, expect, it } from 'vitest';
import { inspectDocumentIntegrity } from './documentIntegrityService';

const notes = [
  { path: '/vault/chapters/one.adoc', name: 'one', title: 'One', content: '' },
  { path: '/vault/target.adoc', name: 'target', title: 'Target', content: '' },
];

describe('inspectDocumentIntegrity', () => {
  it('accepts an existing include and wikilink', () => {
    expect(
      inspectDocumentIntegrity('include::chapters/one.adoc[]\n[[Target]]', '/vault/main.adoc', '/vault', notes),
    ).toEqual([]);
  });

  it('reports missing, recursive, and escaping includes at their source lines', () => {
    const findings = inspectDocumentIntegrity(
      'include::missing.adoc[]\ninclude::main.adoc[]\ninclude::../secret.adoc[]',
      '/vault/main.adoc',
      '/vault',
      notes,
    );
    expect(findings.map((finding) => finding.id)).toEqual([
      'include-missing-1',
      'include-recursive-2',
      'include-outside-root-3',
    ]);
  });

  it('warns for an unresolved wikilink but only when a vault is available to check it', () => {
    expect(inspectDocumentIntegrity('[[Missing|Missing]]', '/vault/main.adoc', '/vault', notes)).toEqual(
      expect.arrayContaining([expect.objectContaining({ severity: 'warning', line: 1 })]),
    );
    expect(inspectDocumentIntegrity('[[Missing|Missing]]', '/vault/main.adoc', null, notes)).toEqual([]);
  });

  it('keeps the line for repeated unresolved wikilinks', () => {
    expect(
      inspectDocumentIntegrity('[[Missing|Missing]]\n[[Missing|Missing]]', '/vault/main.adoc', '/vault', notes).map(
        (finding) => finding.line,
      ),
    ).toEqual([1, 2]);
  });
});
