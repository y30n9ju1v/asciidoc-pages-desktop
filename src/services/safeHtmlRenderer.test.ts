import { describe, expect, it } from 'vitest';
import { renderSafeDocumentToHtml } from './safeHtmlRenderer';
import type { SafeDocument } from './safeDocument';

const document: SafeDocument = {
  version: 1,
  metadata: { title: 'Safe <book>', author: 'Writer', language: 'en' },
  diagnostics: [],
  blocks: [
    {
      type: 'section',
      id: 'chapter-one',
      title: 'Chapter one',
      level: 1,
      location: { line: 1 },
      blocks: [
        {
          type: 'paragraph',
          text: 'Ignored by renderer',
          inlines: [
            { type: 'text', value: 'Safe ' },
            { type: 'strong', children: [{ type: 'text', value: 'text' }] },
            { type: 'text', value: ' and ' },
            {
              type: 'link',
              target: 'wikilink:Next%20note',
              children: [{ type: 'text', value: 'next note' }],
              isWikilink: true,
              isUnresolvedWikilink: true,
            },
            { type: 'text', value: ' <script>never runs</script>' },
            { type: 'footnote', children: [{ type: 'text', value: 'A safe note.' }] },
            { type: 'endnote', children: [{ type: 'text', value: 'A deferred note.' }] },
          ],
          location: { line: 2 },
        },
        { type: 'diagram', engine: 'mermaid', code: 'graph TD\n A-->B', location: { line: 3 } },
        { type: 'mathBlock', tex: 'x^2', location: { line: 4 } },
      ],
    },
  ],
};

describe('renderSafeDocumentToHtml', () => {
  it('uses only the allow-listed HTML structure and escapes text content', () => {
    const html = renderSafeDocumentToHtml(document);

    expect(html).toContain('<h1>Safe &lt;book&gt;</h1>');
    expect(html).toContain('<strong>text</strong>');
    expect(html).toContain('href="wikilink:Next%20note" class="wikilink wikilink-new"');
    expect(html).toContain('&lt;script&gt;never runs&lt;/script&gt;');
    expect(html).toContain('<code class="language-mermaid">graph TD');
    expect(html).toContain('<div class="stemblock"><div class="content">\\[x^2\\]</div>');
    expect(html).toContain('id="_footnotedef_1"');
    expect(html).toContain('id="_endnotedef_1"');
    expect(html).toContain('id="endnotes"');
  });

  it('does not create links or image tags for unsafe data in manually constructed models', () => {
    const unsafe = structuredClone(document);
    unsafe.blocks = [
      {
        type: 'paragraph',
        text: 'Unsafe',
        inlines: [
          {
            type: 'link',
            target: 'javascript:alert(1)',
            children: [{ type: 'text', value: 'no link' }],
            isWikilink: false,
            isUnresolvedWikilink: false,
          },
          {
            type: 'inlineImage',
            asset: { kind: 'document-relative', relativePath: '../secret.png' },
            alt: 'no inline image',
          },
        ],
        location: { line: 1 },
      },
      {
        type: 'image',
        asset: { kind: 'document-relative', relativePath: '../private.png' },
        alt: 'No image',
        caption: null,
        location: { line: 2 },
      },
    ];

    const html = renderSafeDocumentToHtml(unsafe);

    expect(html).not.toContain('javascript:');
    expect(html).not.toContain('<img');
    expect(html).toContain('no link');
  });

  it('renders description lists, checklists, and the new inline constructs', () => {
    const doc: SafeDocument = {
      version: 1,
      metadata: { title: 'Book', author: '', language: 'en' },
      diagnostics: [],
      blocks: [
        {
          type: 'descriptionList',
          location: { line: 1 },
          items: [
            {
              term: 'Term',
              termInlines: [{ type: 'text', value: 'Term' }],
              descriptionText: 'Definition',
              descriptionInlines: [{ type: 'text', value: 'Definition' }],
              descriptionBlocks: [],
              location: { line: 1 },
            },
          ],
        },
        {
          type: 'list',
          ordered: false,
          location: { line: 2 },
          items: [
            {
              text: 'Done',
              inlines: [{ type: 'text', value: 'Done' }],
              blocks: [],
              location: { line: 2 },
              checked: true,
            },
            {
              text: 'Todo',
              inlines: [{ type: 'text', value: 'Todo' }],
              blocks: [],
              location: { line: 3 },
              checked: false,
            },
            {
              text: 'Not a checklist',
              inlines: [{ type: 'text', value: 'Not a checklist' }],
              blocks: [],
              location: { line: 4 },
              checked: null,
            },
          ],
        },
        {
          type: 'paragraph',
          text: 'ignored',
          location: { line: 5 },
          inlines: [
            {
              type: 'inlineImage',
              asset: { kind: 'document-relative', relativePath: 'icon.png' },
              alt: 'Icon',
            },
            { type: 'superscript', children: [{ type: 'text', value: '2' }] },
            { type: 'subscript', children: [{ type: 'text', value: '2' }] },
            { type: 'mark', children: [{ type: 'text', value: 'highlighted' }] },
          ],
        },
      ],
    };

    const html = renderSafeDocumentToHtml(doc);

    expect(html).toContain('<dt>Term</dt><dd><p>Definition</p></dd>');
    expect(html).toContain('<input type="checkbox" disabled checked> Done');
    expect(html).toContain('<input type="checkbox" disabled> Todo');
    expect(html).toContain('<p>Not a checklist</p>');
    expect(html).toContain('<img src="icon.png" alt="Icon">');
    expect(html).toContain('<sup>2</sup>');
    expect(html).toContain('<sub>2</sub>');
    expect(html).toContain('<mark>highlighted</mark>');
  });

  it('wraps a captioned image block in a figure with a figcaption', () => {
    const doc: SafeDocument = {
      version: 1,
      metadata: { title: 'Doc', author: 'Author', language: 'en' },
      diagnostics: [],
      blocks: [
        {
          type: 'image',
          asset: { kind: 'document-relative', relativePath: 'diagram.png' },
          alt: 'Diagram',
          caption: 'Figure 1: the diagram',
          location: { line: 1 },
        },
      ],
    };

    const html = renderSafeDocumentToHtml(doc);

    expect(html).toContain(
      '<figure class="imageblock"><div class="content"><img src="diagram.png" alt="Diagram"></div><figcaption>Figure 1: the diagram</figcaption></figure>',
    );
  });

  it('renders rich table cells and an attributed quote without accepting HTML', () => {
    const doc: SafeDocument = {
      version: 4,
      metadata: { title: 'Doc', author: 'Author', language: 'en' },
      diagnostics: [],
      blocks: [
        {
          type: 'table',
          rows: [
            [{ text: 'Feature', inlines: [{ type: 'strong', children: [{ type: 'text', value: 'Feature' }] }] }],
            [
              {
                text: 'Typst',
                inlines: [
                  {
                    type: 'link',
                    target: 'https://typst.app',
                    children: [{ type: 'text', value: 'Typst' }],
                    isWikilink: false,
                    isUnresolvedWikilink: false,
                  },
                ],
              },
            ],
          ],
          hasHeader: true,
          location: { line: 1 },
        },
        {
          type: 'quote',
          text: 'ignored',
          inlines: [{ type: 'text', value: 'A safe quote.' }],
          attribution: 'Ada Lovelace',
          citation: 'Notes',
          location: { line: 4 },
        },
      ],
    };

    const html = renderSafeDocumentToHtml(doc);

    expect(html).toContain('<th><strong>Feature</strong></th>');
    expect(html).toContain('<td><a href="https://typst.app">Typst</a></td>');
    expect(html).toContain('<div class="attribution">&#8212; <cite>Ada Lovelace</cite>, Notes</div>');
  });

  it('renders an uncaptioned image block without a figure wrapper', () => {
    const doc: SafeDocument = {
      version: 1,
      metadata: { title: 'Doc', author: 'Author', language: 'en' },
      diagnostics: [],
      blocks: [
        {
          type: 'image',
          asset: { kind: 'document-relative', relativePath: 'diagram.png' },
          alt: 'Diagram',
          caption: null,
          location: { line: 1 },
        },
      ],
    };

    const html = renderSafeDocumentToHtml(doc);

    expect(html).not.toContain('<figure');
    expect(html).toContain(
      '<div class="imageblock"><div class="content"><img src="diagram.png" alt="Diagram"></div></div>',
    );
  });

  it('numbers a repeated citation identically and appends a resolved References entry', () => {
    const doc: SafeDocument = {
      version: 1,
      metadata: { title: 'Doc', author: '', language: 'en' },
      diagnostics: [],
      blocks: [
        {
          type: 'paragraph',
          text: 'ignored',
          location: { line: 1 },
          inlines: [
            { type: 'citation', key: 'smith2020' },
            { type: 'text', value: ' and again ' },
            { type: 'citation', key: 'smith2020' },
          ],
        },
      ],
    };

    const html = renderSafeDocumentToHtml(doc, [
      { key: 'smith2020', author: 'Jane Smith', title: 'A Great Book', year: '2020', publisher: 'Acme', url: '' },
    ]);

    expect(html.match(/\[1\]/g)).toHaveLength(3); // 2 inline markers + 1 References entry
    expect(html).toContain('id="references"');
    expect(html).toContain('Jane Smith (2020). A Great Book, Acme.');
  });

  it('links a reference to its url when the entry has one, but never for an unsafe scheme', () => {
    const doc: SafeDocument = {
      version: 1,
      metadata: { title: 'Doc', author: '', language: 'en' },
      diagnostics: [],
      blocks: [
        {
          type: 'paragraph',
          text: 'ignored',
          location: { line: 1 },
          inlines: [{ type: 'citation', key: 'smith2020' }],
        },
      ],
    };
    const bibliography = (url: string) => [
      { key: 'smith2020', author: 'Jane Smith', title: 'A Great Book', year: '2020', publisher: '', url },
    ];

    const linked = renderSafeDocumentToHtml(doc, bibliography('https://example.com/book'));
    expect(linked).toContain('<a href="https://example.com/book">Jane Smith (2020). A Great Book.</a>');

    // Regression: entry.url is wire data like any other link target - an
    // unsafe scheme must degrade to a plain, unlinked line rather than ever
    // reaching an href unchecked.
    const unsafe = renderSafeDocumentToHtml(doc, bibliography('javascript:alert(1)'));
    expect(unsafe).not.toContain('<a href="javascript:');
    expect(unsafe).toContain('Jane Smith (2020). A Great Book.');
  });

  it('reports an unresolved citation instead of dropping it, and omits References when nothing is cited', () => {
    const cited: SafeDocument = {
      version: 1,
      metadata: { title: 'Doc', author: '', language: 'en' },
      diagnostics: [],
      blocks: [
        {
          type: 'paragraph',
          text: 'ignored',
          location: { line: 1 },
          inlines: [{ type: 'citation', key: 'missing2021' }],
        },
      ],
    };
    expect(renderSafeDocumentToHtml(cited, [])).toContain('Unresolved citation: missing2021');

    const uncited: SafeDocument = {
      ...cited,
      blocks: [{ type: 'paragraph', text: 'x', inlines: [], location: { line: 1 } }],
    };
    expect(renderSafeDocumentToHtml(uncited, [])).not.toContain('id="references"');
  });
});
