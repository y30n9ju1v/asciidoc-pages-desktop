import type { BookChapter } from './bookProjectService';
import { extractTags } from './tagService';
import type { VaultNote } from './vaultService';
import { createWikilinkResolver, extractWikilinks } from './wikilinkService';

export const MAX_GRAPH_NODES = 250;
const MAX_DOCUMENT_NODES = 220;

export type GraphScope = 'vault' | 'book';
export type GraphDocumentType = 'all' | 'chapter' | 'note';

export interface GraphNode {
  id: string;
  kind: 'document' | 'broken';
  path: string | null;
  title: string;
  folder: string;
  tags: string[];
  documentType: Exclude<GraphDocumentType, 'all'> | null;
}

export interface GraphEdge {
  source: string;
  target: string;
}

export interface GraphModel {
  nodes: GraphNode[];
  edges: GraphEdge[];
  documentCount: number;
  brokenLinkCount: number;
}

export interface GraphFilters {
  scope: GraphScope;
  documentType: GraphDocumentType;
  folder: string;
  tag: string;
  query: string;
  showIsolated: boolean;
  showBroken: boolean;
}

export interface FilteredGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  totalMatchingDocuments: number;
  hiddenByLimit: number;
  isolatedCount: number;
}

export interface GraphPosition extends GraphNode {
  x: number;
  y: number;
}

function normalized(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function brokenNodeId(target: string): string {
  return `missing:${normalized(target)}`;
}

function folderOf(path: string, vaultRoot: string | null): string {
  const relative = vaultRoot && path.startsWith(`${vaultRoot}/`) ? path.slice(vaultRoot.length + 1) : path;
  const separator = relative.lastIndexOf('/');
  return separator === -1 ? '/' : relative.slice(0, separator) || '/';
}

function bookPathSet(chapters: readonly BookChapter[]): Set<string> {
  return new Set(chapters.map((chapter) => chapter.path));
}

function addEdge(edges: GraphEdge[], seen: Set<string>, source: string, target: string): void {
  const key = `${source}\u0000${target}`;
  if (seen.has(key)) return;
  seen.add(key);
  edges.push({ source, target });
}

/** Builds a read-only graph from the same resolved wikilinks used by preview
 * and backlinks. Missing targets are explicit nodes so they cannot be
 * confused with documents merely outside the selected Book Project scope. */
export function buildGraphModel(
  notes: readonly VaultNote[],
  chapters: readonly BookChapter[] = [],
  vaultRoot: string | null = null,
): GraphModel {
  const chapterPaths = bookPathSet(chapters);
  const nodes = notes.map<GraphNode>((note) => ({
    id: note.path,
    kind: 'document',
    path: note.path,
    title: note.title,
    folder: folderOf(note.path, vaultRoot),
    tags: [...new Set(extractTags(note.content))].sort((left, right) => left.localeCompare(right)),
    documentType: chapterPaths.has(note.path) ? 'chapter' : 'note',
  }));
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const edges: GraphEdge[] = [];
  const seenEdges = new Set<string>();
  const resolveWikilink = createWikilinkResolver(notes);
  let brokenLinkCount = 0;

  for (const note of notes) {
    for (const link of extractWikilinks(note.content)) {
      const resolved = resolveWikilink(link.target);
      if (resolved) {
        addEdge(edges, seenEdges, note.path, resolved.path);
        continue;
      }
      const id = brokenNodeId(link.target);
      if (!byId.has(id)) {
        byId.set(id, {
          id,
          kind: 'broken',
          path: null,
          title: link.target,
          folder: '',
          tags: [],
          documentType: null,
        });
        brokenLinkCount += 1;
      }
      addEdge(edges, seenEdges, note.path, id);
    }
  }

  return { nodes: [...byId.values()], edges, documentCount: notes.length, brokenLinkCount };
}

function matchesDocumentType(node: GraphNode, documentType: GraphDocumentType): boolean {
  return documentType === 'all' || node.documentType === documentType;
}

function matchesSearch(node: GraphNode, query: string): boolean {
  if (!query) return true;
  const text = normalized(query);
  return (
    normalized(node.title).includes(text) ||
    normalized(node.folder).includes(text) ||
    node.tags.some((tag) => normalized(tag).includes(text))
  );
}

function inScope(node: GraphNode, scope: GraphScope): boolean {
  return node.kind === 'document' && (scope === 'vault' || node.documentType === 'chapter');
}

function documentMatches(node: GraphNode, filters: GraphFilters): boolean {
  return (
    inScope(node, filters.scope) &&
    matchesDocumentType(node, filters.documentType) &&
    (filters.folder === 'all' || node.folder === filters.folder) &&
    (filters.tag === 'all' || node.tags.includes(filters.tag)) &&
    matchesSearch(node, filters.query)
  );
}

function degreeByNode(edges: readonly GraphEdge[]): Map<string, number> {
  const degrees = new Map<string, number>();
  for (const { source, target } of edges) {
    degrees.set(source, (degrees.get(source) ?? 0) + 1);
    degrees.set(target, (degrees.get(target) ?? 0) + 1);
  }
  return degrees;
}

function rankDocuments(nodes: GraphNode[], degrees: Map<string, number>): GraphNode[] {
  return [...nodes].sort(
    (left, right) =>
      (degrees.get(right.id) ?? 0) - (degrees.get(left.id) ?? 0) ||
      left.title.localeCompare(right.title) ||
      left.id.localeCompare(right.id),
  );
}

/** Applies scope/filter policy before the Canvas receives any renderable
 * nodes. Limiting the graph here keeps very large vaults predictable without
 * silently doing expensive DOM work in a component. */
export function filterGraphModel(model: GraphModel, filters: GraphFilters): FilteredGraph {
  const allDegrees = degreeByNode(model.edges);
  const matchingDocuments = rankDocuments(
    model.nodes.filter((node) => documentMatches(node, filters)),
    allDegrees,
  );
  const visibleDocuments = matchingDocuments.slice(0, MAX_DOCUMENT_NODES);
  const visibleIds = new Set(visibleDocuments.map((node) => node.id));
  const brokenNodeIds = new Set(model.nodes.filter((node) => node.kind === 'broken').map((node) => node.id));
  const includedEdges = model.edges.filter(
    (edge) => visibleIds.has(edge.source) && (visibleIds.has(edge.target) || filters.showBroken),
  );
  const brokenIds = new Set(includedEdges.map((edge) => edge.target).filter((id) => brokenNodeIds.has(id)));
  const availableBroken = model.nodes.filter((node) => node.kind === 'broken' && brokenIds.has(node.id));
  const visibleBroken = filters.showBroken ? availableBroken.slice(0, MAX_GRAPH_NODES - visibleDocuments.length) : [];
  const completeIds = new Set([...visibleIds, ...visibleBroken.map((node) => node.id)]);
  const edges = includedEdges.filter((edge) => completeIds.has(edge.source) && completeIds.has(edge.target));
  const degrees = degreeByNode(edges);
  const isolatedCount = visibleDocuments.filter((node) => (degrees.get(node.id) ?? 0) === 0).length;
  const documents = filters.showIsolated
    ? visibleDocuments
    : visibleDocuments.filter((node) => (degrees.get(node.id) ?? 0) > 0);
  const nodeIds = new Set([...documents.map((node) => node.id), ...visibleBroken.map((node) => node.id)]);
  const filteredEdges = edges.filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target));
  return {
    nodes: [...documents, ...visibleBroken],
    edges: filteredEdges,
    totalMatchingDocuments: matchingDocuments.length,
    hiddenByLimit: Math.max(0, matchingDocuments.length - MAX_DOCUMENT_NODES),
    isolatedCount,
  };
}

export function graphFolders(model: GraphModel): string[] {
  return [...new Set(model.nodes.filter((node) => node.kind === 'document').map((node) => node.folder))].sort((a, b) =>
    a.localeCompare(b),
  );
}

export function graphTags(model: GraphModel): string[] {
  return [...new Set(model.nodes.flatMap((node) => node.tags))].sort((a, b) => a.localeCompare(b));
}

function hash(value: string): number {
  const result = [...value].reduce(
    (current, character) => Math.imul(current ^ character.charCodeAt(0), 16777619) >>> 0,
    2166136261,
  );
  return result / 2 ** 32;
}

function initialPosition(node: GraphNode, index: number): { x: number; y: number } {
  const angle = index * 2.399963229728653 + hash(node.id) * 0.5;
  const radius = 70 + Math.sqrt(index + 1) * 48;
  return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
}

function applyRepulsion(positions: GraphPosition[]): void {
  for (let sourceIndex = 0; sourceIndex < positions.length; sourceIndex += 1) {
    for (let targetIndex = sourceIndex + 1; targetIndex < positions.length; targetIndex += 1) {
      const source = positions[sourceIndex];
      const target = positions[targetIndex];
      const dx = target.x - source.x || 0.1;
      const dy = target.y - source.y || 0.1;
      const distanceSquared = Math.max(dx * dx + dy * dy, 1);
      const force = Math.min(900 / distanceSquared, 8);
      source.x -= (dx * force) / 20;
      source.y -= (dy * force) / 20;
      target.x += (dx * force) / 20;
      target.y += (dy * force) / 20;
    }
  }
}

function applyEdgeSprings(positions: Map<string, GraphPosition>, edges: readonly GraphEdge[]): void {
  for (const edge of edges) {
    const source = positions.get(edge.source);
    const target = positions.get(edge.target);
    if (!source || !target) continue;
    const dx = target.x - source.x;
    const dy = target.y - source.y;
    const distance = Math.max(Math.hypot(dx, dy), 1);
    const force = (distance - 105) * 0.015;
    source.x += (dx / distance) * force;
    source.y += (dy / distance) * force;
    target.x -= (dx / distance) * force;
    target.y -= (dy / distance) * force;
  }
}

/** A deterministic, bounded force layout. It deliberately stops after a
 * small fixed number of iterations so opening a graph never starts an
 * unbounded background simulation. */
export function layoutGraph(nodes: readonly GraphNode[], edges: readonly GraphEdge[]): GraphPosition[] {
  const positions = nodes.map((node, index) => ({ ...node, ...initialPosition(node, index) }));
  const byId = new Map(positions.map((node) => [node.id, node]));
  for (let iteration = 0; iteration < 48; iteration += 1) {
    applyRepulsion(positions);
    applyEdgeSprings(byId, edges);
  }
  return positions;
}
