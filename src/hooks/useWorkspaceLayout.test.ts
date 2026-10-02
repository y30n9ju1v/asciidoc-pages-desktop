import { describe, expect, it } from 'vitest';
import {
  clampExplorerWidth,
  editorPercentBounds,
  MAX_EXPLORER_WIDTH,
  MIN_EXPLORER_WIDTH,
  MIN_WORKSPACE_PANE_WIDTH,
} from './useWorkspaceLayout';

describe('clampExplorerWidth', () => {
  it('keeps the explorer wide enough for its navigation controls', () => {
    expect(clampExplorerWidth(1)).toBe(MIN_EXPLORER_WIDTH);
    expect(clampExplorerWidth(MIN_EXPLORER_WIDTH - 1)).toBe(MIN_EXPLORER_WIDTH);
  });

  it('preserves valid widths and prevents an oversized explorer', () => {
    expect(clampExplorerWidth(320)).toBe(320);
    expect(clampExplorerWidth(MAX_EXPLORER_WIDTH + 1)).toBe(MAX_EXPLORER_WIDTH);
  });

  it('keeps both writing panes readable in tablet-sized workspaces', () => {
    const bounds = editorPercentBounds(760);

    expect(bounds.minimum).toBeCloseTo((MIN_WORKSPACE_PANE_WIDTH / 760) * 100);
    expect(bounds.maximum).toBeCloseTo(100 - bounds.minimum);
  });
});
