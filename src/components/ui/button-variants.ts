import { cva } from 'class-variance-authority';

// Pulled out of button.tsx (which otherwise exported this alongside the
// Button component itself) - same react-refresh/only-export-components fix
// this codebase already applied to FileExplorer.tsx/buildFileTree: Vite's
// Fast Refresh can't hot-reload a module that exports both a component and
// a plain value.
export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground shadow-xs hover:bg-primary/90',
        destructive:
          'bg-destructive text-destructive-foreground shadow-xs hover:bg-destructive/90 focus-visible:ring-destructive/20',
        // This app's established "outline chip that fills solid on hover"
        // look (see index.css's now-superseded .btn-action/.btn-export) -
        // kept as the default outline treatment rather than shadcn's plain
        // border-only outline, so components ported from those classes
        // read as the same visual language, not two different button styles.
        outline: 'border bg-transparent text-foreground shadow-xs hover:bg-accent hover:text-accent-foreground',
        secondary: 'bg-secondary text-secondary-foreground shadow-xs hover:bg-secondary/80',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        link: 'text-[var(--color-brand)] underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm: 'h-8 rounded-md gap-1.5 px-3',
        lg: 'h-10 rounded-md px-6',
        icon: 'size-9',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);
