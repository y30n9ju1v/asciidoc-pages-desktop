import { describe, expect, it } from 'vitest';
import { createBookTemplatePlan, projectForBookTemplate } from './bookTemplateService';

describe('bookTemplateService', () => {
  it('builds a technical manuscript whose master document includes its chapters', () => {
    const plan = createBookTemplatePlan({ templateId: 'technical', title: 'Guide', author: 'Ada', language: 'en' });
    expect(plan.mainDocumentPath).toBe('main.adoc');
    expect(plan.files[0].content).toContain('include::chapters/01-getting-started.adoc[]');
    expect(plan.project.metadata.author).toBe('Ada');
    expect(projectForBookTemplate('/vault', plan).chapters[0]).toMatchObject({
      path: '/vault/chapters/01-getting-started.adoc',
      title: 'Getting started',
    });
  });

  it('builds a multi-file demo whose included chapters cross-reference each other', () => {
    const plan = createBookTemplatePlan({ templateId: 'linked-demo', title: 'Linked', author: 'Ada', language: 'en' });
    const main = plan.files.find((file) => file.path === 'main.adoc')!;
    const overview = plan.files.find((file) => file.path === 'chapters/01-overview.adoc')!;
    const workflow = plan.files.find((file) => file.path === 'chapters/02-writing-workflow.adoc')!;

    expect(main.content).toContain('include::chapters/01-overview.adoc[]');
    expect(main.content).toContain('include::chapters/02-writing-workflow.adoc[]');
    expect(overview.content).toContain('<<writing-workflow,the writing workflow>>');
    expect(workflow.content).toContain('<<publishing-overview,the overview>>');
  });
});
