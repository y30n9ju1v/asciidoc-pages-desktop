import { describe, expect, it } from 'vitest';
import { createUnhandledRejectionDiagnostic, sanitizeDiagnosticText } from './diagnosticService';

describe('sanitizeDiagnosticText', () => {
  it('removes local user paths before a diagnostic is written', () => {
    expect(sanitizeDiagnosticText('Could not open /Users/kim/private/book.adoc')).toBe('Could not open <local-path>');
  });

  it('bounds diagnostic fields', () => {
    expect(sanitizeDiagnosticText('x'.repeat(4_001))).toHaveLength(4_000);
  });

  it('creates a portable diagnostic from a rejected value', () => {
    expect(createUnhandledRejectionDiagnostic('Failed to read /Users/kim/private/book.adoc')).toMatchObject({
      source: 'unhandled-rejection',
      message: 'Failed to read <local-path>',
    });
  });
});
