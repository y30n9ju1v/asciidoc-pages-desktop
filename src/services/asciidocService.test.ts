import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { errorRenderResult, renderAsciidoc } from './asciidocService';
import { collectAssetReferences } from './pdfPublicationRequest';
import { findBrokenCrossReferences } from './crossReferenceService';
import { rewriteWikilinksForRender } from './wikilinkService';

const SAMPLE_BOOK_DIR = resolve(process.cwd(), 'sample-book');

/** Mirrors renderPipeline.ts's real order: includes are expanded first, then
 * wikilinks are rewritten, and only then does Asciidoctor see the source.
 * Rendering the raw source instead would hide exactly the class of bug this
 * covers - `[[id]]` block anchors being consumed as wikilinks before
 * Asciidoctor ever parses them. */
async function expandedSampleBook(): Promise<string> {
  let content = await readFile(resolve(SAMPLE_BOOK_DIR, 'main.adoc'), 'utf8');
  for (const chapter of [
    '01-introduction.adoc',
    '02-architecture-diagrams.adoc',
    '03-code-examples.adoc',
    '04-publication-verification.adoc',
    '05-typst-publication-features.adoc',
  ]) {
    content = content.replace(`include::${chapter}[]`, await readFile(resolve(SAMPLE_BOOK_DIR, chapter), 'utf8'));
  }
  return rewriteWikilinksForRender(content, []);
}

describe('renderAsciidoc', () => {
  it('preserves a pipeline failure message for non-HTML consumers', () => {
    const result = errorRenderResult(new Error('Image adapter unavailable'));

    expect(result.renderError).toBe('Image adapter unavailable');
    expect(result.safeDocument).toBeDefined();
  });

  it('attaches the serializable SafeDocument derived from the parser AST', async () => {
    const result = await renderAsciidoc(`= Safe book
Writer

== Chapter

[source,mermaid]
----
graph TD
  A --> B
----`);

    expect(result.safeDocument).toEqual(
      expect.objectContaining({
        version: 4,
        metadata: expect.objectContaining({ title: 'Safe book', author: 'Writer' }),
        blocks: [
          expect.objectContaining({
            type: 'section',
            blocks: [expect.objectContaining({ type: 'diagram', engine: 'mermaid' })],
          }),
        ],
        diagnostics: [],
      }),
    );
    expect(result.html).toContain('<div id="header"><h1>Safe book</h1>');
    expect(result.html).toContain('<code class="language-mermaid">graph TD');
  });

  it('decodes the HTML entities Asciidoctor substitutes into the document title and author', async () => {
    // getDocumentTitle()/getAuthor() return Asciidoctor's own substituted
    // text ("&" already turned into the literal string "&amp;") - a real
    // reproduction of a report that PDF/HTML output showed "&amp;" verbatim
    // wherever a title or author used "&".
    const result = await renderAsciidoc(`= Sea & Sky\nA & B\n\ncontent`);

    expect(result.meta.title).toBe('Sea & Sky');
    expect(result.meta.author).toBe('A & B');
    expect(result.safeDocument?.metadata).toEqual(expect.objectContaining({ title: 'Sea & Sky', author: 'A & B' }));
  });

  it('keeps double-delimiter emphasis and list-item formatting through the real Asciidoctor.js AST', async () => {
    const result = await renderAsciidoc(`= Safe book
Writer

== Chapter

Edit **AsciiDoc** documents, and publish **HTML** or **EPUB3**.

* **Monaco Editor Integration**: full syntax highlighting.
* Plain item.
`);

    expect(result.html).toContain('<strong>AsciiDoc</strong>');
    expect(result.html).toContain('<strong>HTML</strong>');
    expect(result.html).toContain('<strong>EPUB3</strong>');
    expect(result.html).not.toMatch(/[^<]\*[^<]/); // no stray literal asterisks leak into the rendered text
    expect(result.html).toContain('<strong>Monaco Editor Integration</strong>: full syntax highlighting.');
  });

  it('preserves rich table cells and quote provenance through the real Asciidoctor.js AST', async () => {
    const result = await renderAsciidoc(`= Safe book
Writer

|===
|*Feature* |link:https://typst.app[Typst]
|===

[quote, Ada Lovelace, Notes]
____
A safe quote.
____`);

    const table = result.safeDocument?.blocks.find((block) => block.type === 'table');
    const quote = result.safeDocument?.blocks.find((block) => block.type === 'quote');

    expect(table).toEqual(
      expect.objectContaining({
        rows: [
          expect.arrayContaining([
            expect.objectContaining({ inlines: expect.arrayContaining([expect.objectContaining({ type: 'strong' })]) }),
            expect.objectContaining({ inlines: expect.arrayContaining([expect.objectContaining({ type: 'link' })]) }),
          ]),
        ],
      }),
    );
    expect(quote).toEqual(expect.objectContaining({ attribution: 'Ada Lovelace', citation: 'Notes' }));
  });

  it('keeps footnotes and deferred endnotes in every safe rendering model', async () => {
    const result = await renderAsciidoc(`= Notes sample

== Chapter

The explanation has a footnote:[A page-level note.] and an endnote:[A deferred note.].
`);

    expect(result.safeDocument?.blocks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'section',
          blocks: expect.arrayContaining([
            expect.objectContaining({
              type: 'paragraph',
              inlines: expect.arrayContaining([
                expect.objectContaining({ type: 'footnote' }),
                expect.objectContaining({ type: 'endnote' }),
              ]),
            }),
          ]),
        }),
      ]),
    );
    expect(result.html).toContain('id="_footnotedef_1"');
    expect(result.html).toContain('id="_endnotedef_1"');
    expect(result.html).toContain('id="endnotes"');
  });

  it('renders description lists, callouts, checklists, and inline image/sup/sub/mark through the real AST', async () => {
    const result = await renderAsciidoc(`= Safe book
Writer

== Chapter

Term:: A definition with **bold** text.

[source,ruby]
----
puts 'hi' # <1>
----
<1> Explains the marked line.

* [x] Done task
* [ ] Todo task

Inline image:icon.png[Icon] and E=mc^2^ and H~2~O and #highlighted# text.
`);

    expect(result.safeDocument?.diagnostics).toEqual([]);
    expect(result.html).toContain('<dt>Term</dt>');
    expect(result.html).toContain('A definition with <strong>bold</strong> text.');
    expect(result.html).toContain('Explains the marked line.');
    expect(result.html).toContain('<input type="checkbox" disabled checked> Done task');
    expect(result.html).toContain('<input type="checkbox" disabled> Todo task');
    expect(result.html).toContain('<img src="icon.png" alt="Icon">');
    expect(result.html).toContain('<sup>2</sup>');
    expect(result.html).toContain('<sub>2</sub>');
    expect(result.html).toContain('<mark>highlighted</mark>');
  });

  it('renders the complete sample-book manuscript through SafeDocument', async () => {
    const result = await renderAsciidoc(await expandedSampleBook());

    expect(result.renderError).toBeUndefined();
    expect(result.safeDocument?.diagnostics).toEqual([]);
    expect(result.html).toContain('id="_endnotedef_1"');
    expect(result.html).toContain('Chapter 4: PDF Publication Verification');
    expect(result.html).toContain('TypeScript Publisher Implementation');
    expect(collectAssetReferences(result.safeDocument!)).toEqual(
      expect.arrayContaining([
        { kind: 'document-relative', relativePath: 'images/sample.jpg' },
        { kind: 'document-relative', relativePath: 'images/publishing-desk.png' },
      ]),
    );
    const labeledBlocks = JSON.stringify(result.safeDocument?.blocks);
    expect(labeledBlocks).toContain('"id":"tbl-matrix"');
    expect(labeledBlocks).toContain('"id":"fig-sample-cover"');
    expect(labeledBlocks).toContain('"id":"lst-publisher"');
    expect(labeledBlocks).toContain('"type":"formal"');
    expect(labeledBlocks).toContain('"type":"columns"');
    expect(labeledBlocks).toContain('"type":"documentPart"');
    expect(labeledBlocks).toContain('"referenceForm":"page"');
    // Every `<<id>>` in the sample book must resolve - an unresolved one
    // fails the whole Typst compile, which is how this manuscript silently
    // stopped producing a PDF.
    expect(findBrokenCrossReferences(result.safeDocument)).toEqual([]);
  });
});
