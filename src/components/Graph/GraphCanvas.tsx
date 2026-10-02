import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { layoutGraph, type FilteredGraph, type GraphNode, type GraphPosition } from '../../services/graphViewService';

interface Viewport {
  scale: number;
  offsetX: number;
  offsetY: number;
}

interface CanvasSize {
  width: number;
  height: number;
}

interface DragState {
  x: number;
  y: number;
  offsetX: number;
  offsetY: number;
}

interface GraphCanvasProps {
  graph: FilteredGraph;
  currentPath: string | null;
  onOpenDocument: (path: string) => void;
}

const INITIAL_VIEWPORT: Viewport = { scale: 1, offsetX: 0, offsetY: 0 };

function screenPosition(node: GraphPosition, viewport: Viewport, size: CanvasSize): { x: number; y: number } {
  return {
    x: size.width / 2 + viewport.offsetX + node.x * viewport.scale,
    y: size.height / 2 + viewport.offsetY + node.y * viewport.scale,
  };
}

function nodeRadius(node: GraphNode, currentPath: string | null): number {
  if (node.path === currentPath) return 8;
  return node.kind === 'broken' ? 6 : 5;
}

function nodeColor(node: GraphNode, currentPath: string | null): string {
  if (node.path === currentPath) return '#2563eb';
  if (node.kind === 'broken') return '#dc2626';
  return node.documentType === 'chapter' ? '#7c3aed' : '#0f766e';
}

function isOnCanvas(point: { x: number; y: number }, size: CanvasSize): boolean {
  return point.x > -20 && point.x < size.width + 20 && point.y > -20 && point.y < size.height + 20;
}

function prepareCanvas(canvas: HTMLCanvasElement, size: CanvasSize): CanvasRenderingContext2D | null {
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.floor(size.width * ratio));
  canvas.height = Math.max(1, Math.floor(size.height * ratio));
  const context = canvas.getContext('2d');
  if (!context) return null;
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, size.width, size.height);
  return context;
}

function drawEdges(
  context: CanvasRenderingContext2D,
  positions: Map<string, GraphPosition>,
  edges: FilteredGraph['edges'],
  viewport: Viewport,
  size: CanvasSize,
): void {
  context.lineWidth = 1;
  context.strokeStyle = 'rgba(100, 116, 139, 0.42)';
  for (const edge of edges) {
    const source = positions.get(edge.source);
    const target = positions.get(edge.target);
    if (!source || !target) continue;
    const sourcePoint = screenPosition(source, viewport, size);
    const targetPoint = screenPosition(target, viewport, size);
    if (!isOnCanvas(sourcePoint, size) && !isOnCanvas(targetPoint, size)) continue;
    context.setLineDash(target.kind === 'broken' ? [4, 4] : []);
    context.beginPath();
    context.moveTo(sourcePoint.x, sourcePoint.y);
    context.lineTo(targetPoint.x, targetPoint.y);
    context.stroke();
  }
  context.setLineDash([]);
}

function drawNodes(
  context: CanvasRenderingContext2D,
  positions: GraphPosition[],
  viewport: Viewport,
  size: CanvasSize,
  currentPath: string | null,
  hoveredId: string | null,
): void {
  for (const node of positions) {
    const point = screenPosition(node, viewport, size);
    if (!isOnCanvas(point, size)) continue;
    const radius = nodeRadius(node, currentPath);
    context.fillStyle = nodeColor(node, currentPath);
    context.beginPath();
    context.arc(point.x, point.y, radius, 0, Math.PI * 2);
    context.fill();
    if (node.id !== hoveredId && node.path !== currentPath) continue;
    context.strokeStyle = '#ffffff';
    context.lineWidth = 2;
    context.stroke();
  }
}

function drawHoverLabel(
  context: CanvasRenderingContext2D,
  hovered: GraphPosition | undefined,
  viewport: Viewport,
  size: CanvasSize,
): void {
  if (!hovered) return;
  const point = screenPosition(hovered, viewport, size);
  const label = hovered.kind === 'broken' ? `Missing: ${hovered.title}` : hovered.title;
  context.font = '12px ui-sans-serif, system-ui, sans-serif';
  const width = Math.min(context.measureText(label).width + 16, size.width - 12);
  const x = Math.max(6, Math.min(point.x + 10, size.width - width - 6));
  const y = Math.max(6, point.y - 28);
  context.fillStyle = 'rgba(15, 23, 42, 0.92)';
  context.fillRect(x, y, width, 22);
  context.fillStyle = '#ffffff';
  context.fillText(label, x + 8, y + 15);
}

function drawGraph(
  canvas: HTMLCanvasElement,
  positions: GraphPosition[],
  graph: FilteredGraph,
  viewport: Viewport,
  size: CanvasSize,
  currentPath: string | null,
  hoveredId: string | null,
): void {
  const context = prepareCanvas(canvas, size);
  if (!context) return;
  const byId = new Map(positions.map((node) => [node.id, node]));
  drawEdges(context, byId, graph.edges, viewport, size);
  drawNodes(context, positions, viewport, size, currentPath, hoveredId);
  drawHoverLabel(context, hoveredId ? byId.get(hoveredId) : undefined, viewport, size);
}

function pointFromEvent(event: React.PointerEvent<HTMLCanvasElement> | React.WheelEvent<HTMLCanvasElement>): {
  x: number;
  y: number;
} {
  const rect = event.currentTarget.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

function hitNode(
  positions: GraphPosition[],
  viewport: Viewport,
  size: CanvasSize,
  point: { x: number; y: number },
  currentPath: string | null,
): GraphPosition | null {
  return (
    [...positions].reverse().find((node) => {
      const position = screenPosition(node, viewport, size);
      return Math.hypot(position.x - point.x, position.y - point.y) <= nodeRadius(node, currentPath) + 5;
    }) ?? null
  );
}

/** Canvas keeps graph nodes out of the DOM. Combined with the service-level
 * node limit, this is the graph view's virtualization boundary for large vaults. */
export function GraphCanvas({ graph, currentPath, onOpenDocument }: GraphCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const [size, setSize] = useState<CanvasSize>({ width: 1, height: 1 });
  const [viewport, setViewport] = useState<Viewport>(INITIAL_VIEWPORT);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const positions = useMemo(() => layoutGraph(graph.nodes, graph.edges), [graph.edges, graph.nodes]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(([entry]) => {
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    drawGraph(canvas, positions, graph, viewport, size, currentPath, hoveredId);
  }, [currentPath, graph, hoveredId, positions, size, viewport]);

  const updateHoveredNode = useCallback(
    (point: { x: number; y: number }) =>
      setHoveredId(hitNode(positions, viewport, size, point, currentPath)?.id ?? null),
    [currentPath, positions, size, viewport],
  );

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const point = pointFromEvent(event);
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { ...point, offsetX: viewport.offsetX, offsetY: viewport.offsetY };
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const point = pointFromEvent(event);
    const drag = dragRef.current;
    if (!drag) {
      updateHoveredNode(point);
      return;
    }
    setViewport((current) => ({
      ...current,
      offsetX: drag.offsetX + point.x - drag.x,
      offsetY: drag.offsetY + point.y - drag.y,
    }));
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const point = pointFromEvent(event);
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag || Math.hypot(point.x - drag.x, point.y - drag.y) > 5) return;
    const node = hitNode(positions, viewport, size, point, currentPath);
    if (node?.path) onOpenDocument(node.path);
  };

  const handleWheel = (event: React.WheelEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    const point = pointFromEvent(event);
    const scale = Math.min(2.5, Math.max(0.35, viewport.scale * (event.deltaY > 0 ? 0.9 : 1.1)));
    const graphX = (point.x - size.width / 2 - viewport.offsetX) / viewport.scale;
    const graphY = (point.y - size.height / 2 - viewport.offsetY) / viewport.scale;
    setViewport({
      scale,
      offsetX: point.x - size.width / 2 - graphX * scale,
      offsetY: point.y - size.height / 2 - graphY * scale,
    });
  };

  return (
    <canvas
      ref={canvasRef}
      className="h-full w-full touch-none cursor-grab rounded-md bg-[radial-gradient(circle_at_center,var(--color-muted)_0%,transparent_70%)] active:cursor-grabbing"
      role="img"
      aria-label={`${graph.nodes.length} visible notes and links. Drag to pan, use the scroll wheel to zoom, and select a note to open it.`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={() => {
        if (!dragRef.current) setHoveredId(null);
      }}
      onWheel={handleWheel}
    />
  );
}
