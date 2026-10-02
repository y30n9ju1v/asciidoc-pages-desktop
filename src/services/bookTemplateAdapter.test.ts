import { describe, expect, it } from 'vitest';
import { templatePathWithinVault } from './bookTemplateAdapter';

describe('bookTemplateAdapter', () => {
  it('keeps starter files inside the selected Vault', () => {
    expect(templatePathWithinVault('/vault', 'chapters/one.adoc')).toBe('/vault/chapters/one.adoc');
    expect(() => templatePathWithinVault('/vault', '../outside.adoc')).toThrow('inside the selected Vault');
    expect(() => templatePathWithinVault('/vault', '/outside.adoc')).toThrow('inside the selected Vault');
  });
});
