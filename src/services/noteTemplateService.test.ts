import { describe, expect, it } from 'vitest';
import { applyTemplatePlaceholders } from './noteTemplateService';

describe('applyTemplatePlaceholders', () => {
  it('expands {{title}} and {{date}}, tolerating extra whitespace inside the braces', () => {
    expect(
      applyTemplatePlaceholders('= {{title}}\n:date: {{ date }}\n', { title: 'Weekly Sync', date: '2026-01-05' }),
    ).toBe('= Weekly Sync\n:date: 2026-01-05\n');
  });

  it('leaves unrelated content and unsupported placeholders untouched', () => {
    expect(applyTemplatePlaceholders('{{author}} wrote this on {{date}}', { title: 'x', date: '2026-01-05' })).toBe(
      '{{author}} wrote this on 2026-01-05',
    );
  });
});
