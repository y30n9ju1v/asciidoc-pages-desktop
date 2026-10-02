import { describe, expect, it } from 'vitest';
import { buildGraphModel, filterGraphModel, layoutGraph, type GraphFilters } from './graphViewService';

const filters: GraphFilters = {
  scope: 'vault',
  documentType: 'all',
  folder: 'all',
  tag: 'all',
  query: '',
  showIsolated: true,
  showBroken: true,
};

const notes = [
  { path: '/vault/book/chapter.adoc', name: 'chapter', title: 'Chapter', content: '#book [[Research]] [[Missing]]' },
  { path: '/vault/research.adoc', name: 'research', title: 'Research', content: '#source [[Chapter]]' },
  { path: '/vault/ideas.adoc', name: 'ideas', title: 'Ideas', content: '#draft' },
];

describe('graph view model', () => {
  it('uses the same wikilink resolution as the rest of the vault and retains missing targets', () => {
    const graph = buildGraphModel(
      notes,
      [{ path: '/vault/book/chapter.adoc', title: 'Chapter', status: 'draft' }],
      '/vault',
    );

    expect(graph.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: '/vault/book/chapter.adoc', folder: 'book', documentType: 'chapter' }),
        expect.objectContaining({ id: 'missing:missing', kind: 'broken', title: 'Missing' }),
      ]),
    );
    expect(graph.edges).toEqual(
      expect.arrayContaining([
        { source: '/vault/book/chapter.adoc', target: '/vault/research.adoc' },
        { source: '/vault/book/chapter.adoc', target: 'missing:missing' },
      ]),
    );
  });

  it('filters by Book Project, tags, and isolated/broken toggles without treating out-of-scope notes as broken', () => {
    const graph = buildGraphModel(
      notes,
      [{ path: '/vault/book/chapter.adoc', title: 'Chapter', status: 'draft' }],
      '/vault',
    );
    const book = filterGraphModel(graph, { ...filters, scope: 'book', showBroken: false });
    const tagged = filterGraphModel(graph, { ...filters, tag: 'draft', showIsolated: false });

    expect(book.nodes.map((node) => node.id)).toEqual(['/vault/book/chapter.adoc']);
    expect(book.nodes.some((node) => node.kind === 'broken')).toBe(false);
    expect(tagged.nodes).toEqual([]);
    expect(book.totalMatchingDocuments).toBe(1);
    expect(tagged.isolatedCount).toBe(1);
  });

  it('lays out each renderable graph node at a finite deterministic point', () => {
    const graph = buildGraphModel(notes);
    const positions = layoutGraph(graph.nodes, graph.edges);

    expect(positions).toHaveLength(graph.nodes.length);
    expect(positions.every(({ x, y }) => Number.isFinite(x) && Number.isFinite(y))).toBe(true);
  });

  it('caps a large vault before it reaches the Canvas renderer', () => {
    const largeVault = Array.from({ length: 300 }, (_unused, index) => ({
      path: `/vault/note-${index}.adoc`,
      name: `note-${index}`,
      title: `Note ${index}`,
      content: index === 299 ? '' : `[[Note ${index + 1}]]`,
    }));
    const graph = buildGraphModel(largeVault, [], '/vault');
    const filtered = filterGraphModel(graph, filters);

    expect(filtered.nodes.length).toBeLessThanOrEqual(250);
    expect(filtered.hiddenByLimit).toBe(80);
  });
});
