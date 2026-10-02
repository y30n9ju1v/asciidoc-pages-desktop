import { createBookProject, type BookChapter, type BookProject } from './bookProjectService';

export type BookTemplateId = 'nonfiction' | 'technical' | 'collection' | 'linked-demo';

export interface BookTemplateOption {
  id: BookTemplateId;
  name: string;
  description: string;
}

export interface BookTemplateFile {
  path: string;
  content: string;
}

export interface BookTemplatePlan {
  files: BookTemplateFile[];
  chapters: Array<{ path: string; title: string }>;
  project: BookProject;
  mainDocumentPath: string;
}

export interface BookTemplateInput {
  templateId: BookTemplateId;
  title: string;
  author: string;
  language: string;
}

export const BOOK_TEMPLATE_OPTIONS: BookTemplateOption[] = [
  { id: 'nonfiction', name: 'Nonfiction book', description: 'Front matter, three chapters, and an appendix.' },
  {
    id: 'technical',
    name: 'Technical guide',
    description: 'A practical guide with setup, concepts, and reference chapters.',
  },
  { id: 'collection', name: 'Essay collection', description: 'A simple introduction and a set of independent essays.' },
  {
    id: 'linked-demo',
    name: 'Linked book demo',
    description: 'A small multi-file manuscript with includes and cross-references for testing publishing.',
  },
];

function documentHeader(title: string, author: string, language: string): string {
  return `= ${title}\n${author ? `:author: ${author}\n` : ''}:lang: ${language}\n:toc:\n:toclevels: 2\n\n`;
}

function chapter(title: string, prompt: string): string {
  return `== ${title}\n\n${prompt}\n`;
}

function filesFor(templateId: BookTemplateId, input: BookTemplateInput): BookTemplateFile[] {
  const header = documentHeader(input.title, input.author, input.language);
  const shared = [
    {
      path: 'main.adoc',
      content: `${header}include::chapters/01-introduction.adoc[]\ninclude::chapters/02-main.adoc[]\ninclude::chapters/03-conclusion.adoc[]\n`,
    },
    {
      path: 'chapters/01-introduction.adoc',
      content: chapter('Introduction', 'State the reader promise and why this book exists.'),
    },
    {
      path: 'chapters/02-main.adoc',
      content: chapter('Main chapter', 'Develop the central argument, example, or method.'),
    },
    {
      path: 'chapters/03-conclusion.adoc',
      content: chapter('Conclusion', 'Give the reader a next action and a lasting takeaway.'),
    },
  ];

  if (templateId === 'technical') {
    return [
      {
        path: 'main.adoc',
        content: `${header}include::chapters/01-getting-started.adoc[]\ninclude::chapters/02-core-concepts.adoc[]\ninclude::chapters/03-reference.adoc[]\n`,
      },
      {
        path: 'chapters/01-getting-started.adoc',
        content: chapter('Getting started', 'Explain prerequisites and the smallest successful first step.'),
      },
      {
        path: 'chapters/02-core-concepts.adoc',
        content: chapter('Core concepts', 'Teach one concept at a time with runnable examples.'),
      },
      {
        path: 'chapters/03-reference.adoc',
        content: chapter('Reference', 'Collect commands, options, limits, and troubleshooting.'),
      },
    ];
  }
  if (templateId === 'collection') {
    return [
      {
        path: 'main.adoc',
        content: `${header}include::chapters/01-preface.adoc[]\ninclude::chapters/02-essay-one.adoc[]\ninclude::chapters/03-essay-two.adoc[]\n`,
      },
      {
        path: 'chapters/01-preface.adoc',
        content: chapter('Preface', 'Introduce the collection and its connecting theme.'),
      },
      { path: 'chapters/02-essay-one.adoc', content: chapter('Essay one', 'Write the first self-contained piece.') },
      { path: 'chapters/03-essay-two.adoc', content: chapter('Essay two', 'Write the next self-contained piece.') },
    ];
  }
  if (templateId === 'linked-demo') {
    return [
      {
        path: 'main.adoc',
        content: `${header}// Open this master file to render every included chapter together.\ninclude::chapters/01-overview.adoc[]\ninclude::chapters/02-writing-workflow.adoc[]\ninclude::chapters/03-publishing.adoc[]\n`,
      },
      {
        path: 'chapters/01-overview.adoc',
        content: `[#publishing-overview]\n== A linked manuscript\n\nThis chapter is included by _main.adoc_. Continue with <<writing-workflow,the writing workflow>>, then return here with a cross-reference.\n\n[source,asciidoc]\n----\ninclude::chapters/02-writing-workflow.adoc[]\n----\n`,
      },
      {
        path: 'chapters/02-writing-workflow.adoc',
        content: `[#writing-workflow]\n== Writing workflow\n\nEach chapter remains a focused file, while the master manuscript renders it as one book. See <<publishing-overview,the overview>> for the project structure.\n\nNOTE: Change this text, save it, and refresh the master document to test the include workflow.\n`,
      },
      {
        path: 'chapters/03-publishing.adoc',
        content: `== Publish together\n\nPDF, HTML, EPUB, and Typst export use the expanded master document. The links to <<publishing-overview,the overview>> and <<writing-workflow,the workflow>> remain inside the published book.\n`,
      },
    ];
  }
  return shared;
}

export function createBookTemplatePlan(input: BookTemplateInput): BookTemplatePlan {
  const files = filesFor(input.templateId, input);
  const project = createBookProject({
    title: input.title,
    author: input.author,
    email: '',
    lang: input.language,
    attributes: {},
  });
  return {
    files,
    chapters: files
      .filter((file) => file.path.startsWith('chapters/'))
      .map((file) => ({ path: file.path, title: file.content.match(/^==\s+(.+)$/m)?.[1] ?? file.path })),
    project,
    mainDocumentPath: 'main.adoc',
  };
}

/** Turns a starter plan into a project only after its paths have a selected Vault root. */
export function projectForBookTemplate(vaultRoot: string, plan: BookTemplatePlan): BookProject {
  const chapters: BookChapter[] = plan.chapters.map((chapter) => ({
    path: `${vaultRoot}/${chapter.path}`,
    title: chapter.title,
    status: 'draft',
  }));
  return { ...plan.project, chapters };
}
