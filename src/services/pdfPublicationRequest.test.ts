import { describe, it, expect } from 'vitest';
import type { SafeDocument } from './safeDocument';

const { collectAssetReferences, collectDiagramCodes, loadPublicationAssets, diagramAssetPath, MAX_ASSET_COUNT } =
  await import('./pdfPublicationRequest');

function documentWith(blocks: SafeDocument['blocks']): SafeDocument {
  return { version: 1, metadata: { title: 'Book', author: 'Author', language: 'en' }, diagnostics: [], blocks };
}

describe('collectAssetReferences', () => {
  it('collects a block image asset', () => {
    const document = documentWith([
      {
        type: 'image',
        asset: { kind: 'document-relative', relativePath: 'cover.png' },
        alt: '',
        caption: null,
        location: { line: 1 },
      },
    ]);

    expect(collectAssetReferences(document)).toEqual([{ kind: 'document-relative', relativePath: 'cover.png' }]);
  });

  it('collects an inline image nested inside every inline container', () => {
    const inlineImage = {
      type: 'inlineImage' as const,
      asset: { kind: 'document-relative' as const, relativePath: 'icon.png' },
      alt: '',
    };
    const document = documentWith([
      {
        type: 'paragraph',
        text: 'x',
        inlines: [
          { type: 'strong', children: [{ type: 'emphasis', children: [{ type: 'mark', children: [inlineImage] }] }] },
          {
            type: 'link',
            target: 'https://example.com',
            children: [inlineImage],
            isWikilink: false,
            isUnresolvedWikilink: false,
          },
          { type: 'footnote', children: [inlineImage] },
          { type: 'endnote', children: [inlineImage] },
          { type: 'superscript', children: [inlineImage] },
          { type: 'subscript', children: [inlineImage] },
        ],
        location: { line: 1 },
      },
    ]);

    expect(collectAssetReferences(document)).toHaveLength(6);
  });

  it('recurses through sections, containers, lists, and description lists', () => {
    const asset = { kind: 'document-relative' as const, relativePath: 'a.png' };
    const imageBlock = { type: 'image' as const, asset, alt: '', caption: null, location: { line: 1 } };
    const document = documentWith([
      { type: 'section', id: null, title: 'S', level: 1, location: { line: 1 }, blocks: [imageBlock] },
      { type: 'container', kind: 'sidebar', title: null, location: { line: 1 }, blocks: [imageBlock] },
      {
        type: 'list',
        ordered: false,
        location: { line: 1 },
        items: [{ text: '', inlines: [], blocks: [imageBlock], location: { line: 1 }, checked: null }],
      },
      {
        type: 'descriptionList',
        location: { line: 1 },
        items: [
          {
            term: 't',
            termInlines: [],
            descriptionText: 'd',
            descriptionInlines: [],
            descriptionBlocks: [imageBlock],
            location: { line: 1 },
          },
        ],
      },
    ]);

    expect(collectAssetReferences(document)).toHaveLength(4);
  });

  it('collects from quote and admonition inlines too', () => {
    const inlineImage = {
      type: 'inlineImage' as const,
      asset: { kind: 'remote' as const, url: 'https://example.com/a.png' },
      alt: '',
    };
    const document = documentWith([
      { type: 'quote', text: '', inlines: [inlineImage], location: { line: 1 } },
      { type: 'admonition', kind: 'note', text: '', inlines: [inlineImage], location: { line: 1 } },
    ]);

    expect(collectAssetReferences(document)).toHaveLength(2);
  });

  it('collects inline image assets from rich table cells', () => {
    const document = documentWith([
      {
        type: 'table',
        id: null,
        caption: null,
        hasHeader: false,
        location: { line: 1 },
        rows: [
          [
            {
              text: 'Icon',
              inlines: [
                {
                  type: 'inlineImage',
                  asset: { kind: 'document-relative', relativePath: 'table-icon.png' },
                  alt: 'Icon',
                },
              ],
            },
          ],
        ],
      },
    ]);

    expect(collectAssetReferences(document)).toEqual([{ kind: 'document-relative', relativePath: 'table-icon.png' }]);
  });

  it('returns an empty array for a document with no assets', () => {
    const document = documentWith([
      { type: 'paragraph', text: 'x', inlines: [{ type: 'text', value: 'x' }], location: { line: 1 } },
    ]);
    expect(collectAssetReferences(document)).toEqual([]);
  });
});

describe('collectDiagramCodes', () => {
  it('collects a top-level diagram block', () => {
    const document = documentWith([
      { type: 'diagram', engine: 'mermaid', code: 'graph TD\n  A --> B', location: { line: 1 } },
    ]);
    expect(collectDiagramCodes(document)).toEqual(['graph TD\n  A --> B']);
  });

  it('recurses through sections, containers, lists, and description lists', () => {
    const diagram = {
      type: 'diagram' as const,
      engine: 'mermaid' as const,
      code: 'graph TD\n  X --> Y',
      location: { line: 1 },
    };
    const document = documentWith([
      { type: 'section', id: null, title: 'S', level: 1, location: { line: 1 }, blocks: [diagram] },
      { type: 'container', kind: 'sidebar', title: null, location: { line: 1 }, blocks: [diagram] },
      {
        type: 'list',
        ordered: false,
        location: { line: 1 },
        items: [{ text: '', inlines: [], blocks: [diagram], location: { line: 1 }, checked: null }],
      },
      {
        type: 'descriptionList',
        location: { line: 1 },
        items: [
          {
            term: 't',
            termInlines: [],
            descriptionText: 'd',
            descriptionInlines: [],
            descriptionBlocks: [diagram],
            location: { line: 1 },
          },
        ],
      },
    ]);
    expect(collectDiagramCodes(document)).toHaveLength(4);
  });

  it('returns an empty array for a document with no diagrams', () => {
    const document = documentWith([
      { type: 'paragraph', text: 'x', inlines: [{ type: 'text', value: 'x' }], location: { line: 1 } },
    ]);
    expect(collectDiagramCodes(document)).toEqual([]);
  });
});

describe('diagramAssetPath', () => {
  it('is stable and content-addressed', () => {
    const a = diagramAssetPath('graph TD\n  A --> B');
    const b = diagramAssetPath('graph TD\n  A --> B');
    const c = diagramAssetPath('graph TD\n  A --> C');
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toMatch(/^mermaid\/[0-9a-f]+\.svg$/);
  });

  // Cross-language golden test: pins the exact FNV-1a hash this function
  // must keep producing, since typst_writer.rs's Rust twin (diagram_asset_path)
  // has to derive the identical path for the identical input with no other
  // coordination between the two implementations. This literal value was
  // computed by actually running the Rust implementation - if this test ever
  // needs to change, the Rust side must change to match, not the other way
  // around.
  it('matches the Rust implementation for a known input', () => {
    expect(diagramAssetPath('graph TD\n  A --> B')).toBe('mermaid/27513e922821c9ca.svg');
  });
});

describe('loadPublicationAssets', () => {
  const docPath = '/Users/foo/book/main.adoc';

  it('resolves a document-relative asset, keyed by its own relativePath', () => {
    const assets = loadPublicationAssets([{ kind: 'document-relative', relativePath: 'images/cover.png' }], docPath);

    expect(assets).toEqual([
      { path: 'images/cover.png', resolvedPath: '/Users/foo/book/images/cover.png', mediaType: 'image/png' },
    ]);
  });

  it('never resolves a remote asset', () => {
    const assets = loadPublicationAssets([{ kind: 'remote', url: 'https://example.com/a.png' }], docPath);
    expect(assets).toEqual([]);
  });

  it('skips assets when the document was never saved', () => {
    const assets = loadPublicationAssets([{ kind: 'document-relative', relativePath: 'a.png' }], null);
    expect(assets).toEqual([]);
  });

  // A `document-relative` ref with a `..`-escaping relativePath is already
  // rejected by isSafeAssetRef itself (it re-derives the same traversal
  // check resolveSafeAssetRef applies at construction), so this is silently
  // skipped here, same as any other ref that fails isSafeAssetRef - the
  // resolveWithinRoot check further down is unreachable for this specific
  // input but kept as defense-in-depth in case that gate is ever weakened.
  it('refuses a path that escapes the document folder', () => {
    const assets = loadPublicationAssets(
      [{ kind: 'document-relative', relativePath: '../../../../etc/passwd' }],
      docPath,
    );
    expect(assets).toEqual([]);
  });

  it('dedupes an asset referenced more than once', () => {
    const refs = [
      { kind: 'document-relative' as const, relativePath: 'a.png' },
      { kind: 'document-relative' as const, relativePath: 'a.png' },
    ];

    const assets = loadPublicationAssets(refs, docPath);
    expect(assets).toHaveLength(1);
  });

  it('rejects a manually constructed ref that type-checks but is not actually safe', () => {
    const assets = loadPublicationAssets(
      [{ kind: 'document-relative', relativePath: 'https://evil.example/x' } as any],
      docPath,
    );
    expect(assets).toEqual([]);
  });

  it('throws once the asset count exceeds the limit', () => {
    const refs = Array.from({ length: MAX_ASSET_COUNT + 1 }, (_, i) => ({
      kind: 'document-relative' as const,
      relativePath: `img-${i}.png`,
    }));

    expect(() => loadPublicationAssets(refs, docPath)).toThrow(/Too many images/);
  });
});
