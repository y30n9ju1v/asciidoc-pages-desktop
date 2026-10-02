import { useRef } from 'react';

/**
 * Wires up pointer-driven resizing for mouse, trackpad, Apple Pencil, and
 * touch. `onDrag` is read fresh at drag-start time, so it always sees the
 * state from the latest render without continually re-registering handlers.
 */
export function useDragResize(onDrag: (moveEvent: MouseEvent) => void) {
  const isDragging = useRef(false);

  const startDrag = (event: React.PointerEvent<HTMLElement>) => {
    event.preventDefault();
    isDragging.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    event.currentTarget.setPointerCapture(event.pointerId);

    const onPointerMove = (moveEvent: PointerEvent) => {
      if (!isDragging.current) return;
      onDrag(moveEvent);
    };

    const finishDrag = () => {
      isDragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', finishDrag);
      window.removeEventListener('pointercancel', finishDrag);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', finishDrag);
    window.addEventListener('pointercancel', finishDrag);
  };

  return startDrag;
}
