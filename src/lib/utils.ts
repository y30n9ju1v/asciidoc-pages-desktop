import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// The standard shadcn/ui helper: clsx for conditional class composition,
// tailwind-merge to resolve conflicting Tailwind utilities in favor of the
// last one (e.g. `cn('px-2', condition && 'px-4')` correctly yields just
// 'px-4' instead of both classes landing in the output).
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
