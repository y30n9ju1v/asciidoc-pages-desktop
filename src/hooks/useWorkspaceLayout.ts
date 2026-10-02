import { useRef, useState } from 'react';
import { useDragResize } from './useDragResize';

export const MIN_EXPLORER_WIDTH = 220;
export const MAX_EXPLORER_WIDTH = 500;
const DEFAULT_EXPLORER_WIDTH = 270;
const MIN_EDITOR_PERCENT = 20;
export const MIN_WORKSPACE_PANE_WIDTH = 320;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

/** Keeps the explorer wide enough for its ribbon, file name, and actions. */
export function clampExplorerWidth(width: number): number {
  return clamp(width, MIN_EXPLORER_WIDTH, MAX_EXPLORER_WIDTH);
}

/** Prevents either writing surface becoming unusably narrow on iPad landscape. */
export function editorPercentBounds(availableWidth: number): { minimum: number; maximum: number } {
  const minimum = clamp((MIN_WORKSPACE_PANE_WIDTH / availableWidth) * 100, MIN_EDITOR_PERCENT, 50);
  return { minimum, maximum: 100 - minimum };
}

/** Owns pane geometry and pointer-driven resizing for the three-column workspace. */
export function useWorkspaceLayout() {
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_EXPLORER_WIDTH);
  const [isExplorerCollapsed, setIsExplorerCollapsed] = useState(false);
  const [editorPercent, setEditorPercent] = useState(50);
  const workspaceRef = useRef<HTMLElement>(null);

  const startSidebarResize = useDragResize((event) => {
    setSidebarWidth(clampExplorerWidth(event.clientX));
  });

  const startEditorResize = useDragResize((event) => {
    const workspace = workspaceRef.current;
    if (!workspace) return;

    const workspaceRect = workspace.getBoundingClientRect();
    const availableWidth = workspaceRect.width - (isExplorerCollapsed ? 0 : sidebarWidth);
    if (availableWidth <= 0) return;

    const relativeX = event.clientX - workspaceRect.left - (isExplorerCollapsed ? 0 : sidebarWidth);
    const { minimum, maximum } = editorPercentBounds(availableWidth);
    setEditorPercent(clamp((relativeX / availableWidth) * 100, minimum, maximum));
  });

  return {
    sidebarWidth,
    editorPercent,
    isExplorerCollapsed,
    workspaceRef,
    startSidebarResize,
    startEditorResize,
    resizeSidebarByKeyboard: (delta: number) => setSidebarWidth((width) => clampExplorerWidth(width + delta * 16)),
    resizeEditorByKeyboard: (delta: number) => {
      const width = workspaceRef.current?.getBoundingClientRect().width ?? 0;
      const available = width - (isExplorerCollapsed ? 0 : sidebarWidth);
      if (available <= 0) return;
      const { minimum, maximum } = editorPercentBounds(available);
      setEditorPercent((percent) => clamp(percent + delta * 2, minimum, maximum));
    },
    toggleExplorer: () => setIsExplorerCollapsed((collapsed) => !collapsed),
  };
}
