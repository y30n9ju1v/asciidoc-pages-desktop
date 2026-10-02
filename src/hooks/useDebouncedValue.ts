import { useEffect, useState } from 'react';

/** Returns `value`, updated only after `delayMs` has passed with no further
 * change - the same debounce-timer shape usePreview.ts already uses for the
 * AsciiDoc render pipeline, generalized here for any value that needs the
 * same "don't recompute on every keystroke" treatment. */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
