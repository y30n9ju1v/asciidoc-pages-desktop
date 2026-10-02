import { describe, expect, it } from 'vitest';
import { groupFootnotesByChapter } from './footnoteRenderer';

describe('groupFootnotesByChapter', () => {
  it('moves each definition beside the chapter containing its reference', () => {
    const html = `
      <div class="sect1"><p>One<a id="_footnoteref_1" href="#_footnotedef_1">1</a></p></div>
      <div class="sect1"><p>Two<a id="_footnoteref_2" href="#_footnotedef_2">2</a></p></div>
      <div id="footnotes">
        <div id="_footnotedef_1" class="footnote">First note</div>
        <div id="_footnotedef_2" class="footnote">Second note</div>
      </div>`;

    const output = groupFootnotesByChapter(html);
    const doc = new DOMParser().parseFromString(output, 'text/html');
    const chapters = doc.body.querySelectorAll(':scope > .sect1');

    expect(doc.getElementById('footnotes')).toBeNull();
    expect(chapters[0].querySelector('.footnotes')?.textContent).toContain('First note');
    expect(chapters[1].querySelector('.footnotes')?.textContent).toContain('Second note');
  });

  it('returns HTML without footnotes unchanged', () => {
    expect(groupFootnotesByChapter('<p>No notes</p>')).toBe('<p>No notes</p>');
  });

  it('keeps multiple footnotes from the same chapter together, in order', () => {
    const html = `
      <div class="sect1">
        <p>One<a id="_footnoteref_1" href="#_footnotedef_1">1</a> Two<a id="_footnoteref_2" href="#_footnotedef_2">2</a></p>
      </div>
      <div id="footnotes">
        <div id="_footnotedef_2" class="footnote">Second note</div>
        <div id="_footnotedef_1" class="footnote">First note</div>
      </div>`;

    const output = groupFootnotesByChapter(html);
    const doc = new DOMParser().parseFromString(output, 'text/html');
    const ids = Array.from(doc.querySelectorAll('.footnotes .footnote')).map((el) => el.id);

    expect(ids).toEqual(['_footnotedef_2', '_footnotedef_1']);
  });

  it('falls back to the document body when there are no chapter sections', () => {
    const html = `
      <p>Text<a id="_footnoteref_1" href="#_footnotedef_1">1</a></p>
      <div id="footnotes"><div id="_footnotedef_1" class="footnote">Only note</div></div>`;

    const output = groupFootnotesByChapter(html);
    const doc = new DOMParser().parseFromString(output, 'text/html');

    expect(doc.getElementById('footnotes')).toBeNull();
    expect(doc.body.querySelector(':scope > .footnotes')?.textContent).toContain('Only note');
  });

  it('puts an orphaned footnote (no matching reference found) in the last chapter', () => {
    const html = `
      <div class="sect1"><p>Chapter one, no references.</p></div>
      <div class="sect1"><p>Chapter two, no references.</p></div>
      <div id="footnotes"><div id="_footnotedef_1" class="footnote">Orphaned note</div></div>`;

    const output = groupFootnotesByChapter(html);
    const doc = new DOMParser().parseFromString(output, 'text/html');
    const chapters = doc.body.querySelectorAll(':scope > .sect1');

    expect(chapters[0].querySelector('.footnotes')).toBeNull();
    expect(chapters[1].querySelector('.footnotes')?.textContent).toContain('Orphaned note');
  });
});
