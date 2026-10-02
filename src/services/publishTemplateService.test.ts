import { describe, it, expect, beforeEach } from 'vitest';
import {
  getPublishTemplate,
  loadStoredPublishTemplateId,
  storePublishTemplateId,
  DEFAULT_PUBLISH_TEMPLATE_ID,
  PUBLISH_TEMPLATE_LIST,
} from './publishTemplateService';

describe('getPublishTemplate', () => {
  it('returns the requested template', () => {
    expect(getPublishTemplate('novel').id).toBe('novel');
  });

  it('falls back to the default for an unknown id', () => {
    expect(getPublishTemplate('not-a-real-template' as any).id).toBe(DEFAULT_PUBLISH_TEMPLATE_ID);
  });

  it('lists every template exactly once', () => {
    const ids = PUBLISH_TEMPLATE_LIST.map((template) => template.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain(DEFAULT_PUBLISH_TEMPLATE_ID);
  });
});

describe('publish template persistence', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('round-trips a valid template id', () => {
    storePublishTemplateId('technical-book');
    expect(loadStoredPublishTemplateId()).toBe('technical-book');
  });

  it('falls back to the default when nothing is stored', () => {
    expect(loadStoredPublishTemplateId()).toBe(DEFAULT_PUBLISH_TEMPLATE_ID);
  });

  it('falls back to the default when the stored value is not a real template', () => {
    localStorage.setItem('asciidoc-studio:publish-template', 'epic-poem');
    expect(loadStoredPublishTemplateId()).toBe(DEFAULT_PUBLISH_TEMPLATE_ID);
  });
});
