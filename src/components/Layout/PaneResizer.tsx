import type { PointerEvent } from 'react';

export function PaneResizer({
  label,
  value,
  minimum = 0,
  maximum = 100,
  unit = '%',
  onResize,
  onPointerDown,
}: {
  label: string;
  value: number;
  minimum?: number;
  maximum?: number;
  unit?: string;
  onResize: (delta: number) => void;
  onPointerDown: (event: PointerEvent<HTMLElement>) => void;
}) {
  return (
    <div
      role="separator"
      tabIndex={0}
      aria-label={label}
      aria-orientation="vertical"
      aria-valuenow={value}
      aria-valuemin={minimum}
      aria-valuemax={maximum}
      aria-valuetext={`${Math.round(value)}${unit}`}
      className="pane-resizer focus-visible:outline-2 focus-visible:outline-primary"
      onPointerDown={onPointerDown}
      title={`${label} · Left/Right arrow keys to resize`}
      onKeyDown={(event) => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
        event.preventDefault();
        onResize(event.key === 'ArrowLeft' ? -1 : 1);
      }}
    />
  );
}
