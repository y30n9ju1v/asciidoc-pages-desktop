import { Command as CommandPrimitive } from 'cmdk';
import { Search } from 'lucide-react';
import type { ComponentPropsWithoutRef } from 'react';
import { cn } from '@/lib/utils';

export function Command({ className, ...props }: ComponentPropsWithoutRef<typeof CommandPrimitive>) {
  return (
    <CommandPrimitive
      data-slot="command"
      className={cn('flex h-full w-full flex-col overflow-hidden', className)}
      {...props}
    />
  );
}

export function CommandInput({ className, ...props }: ComponentPropsWithoutRef<typeof CommandPrimitive.Input>) {
  return (
    <div
      data-slot="command-input-wrapper"
      className="flex items-center gap-2 border-b px-4 py-3 text-muted-foreground"
      cmdk-input-wrapper=""
    >
      <Search className="size-4 shrink-0" />
      <CommandPrimitive.Input
        data-slot="command-input"
        className={cn(
          'h-7 min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground',
          className,
        )}
        {...props}
      />
      <kbd className="hidden rounded border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground sm:inline">
        Esc
      </kbd>
    </div>
  );
}

export function CommandList({ className, ...props }: ComponentPropsWithoutRef<typeof CommandPrimitive.List>) {
  return (
    <CommandPrimitive.List
      data-slot="command-list"
      className={cn('max-h-[min(440px,60vh)] overflow-y-auto p-2', className)}
      {...props}
    />
  );
}

export function CommandEmpty({ className, ...props }: ComponentPropsWithoutRef<typeof CommandPrimitive.Empty>) {
  return (
    <CommandPrimitive.Empty
      data-slot="command-empty"
      className={cn('px-3 py-8 text-center text-sm text-muted-foreground', className)}
      {...props}
    />
  );
}

export function CommandGroup({ className, ...props }: ComponentPropsWithoutRef<typeof CommandPrimitive.Group>) {
  return <CommandPrimitive.Group data-slot="command-group" className={cn('overflow-hidden', className)} {...props} />;
}

export function CommandItem({ className, ...props }: ComponentPropsWithoutRef<typeof CommandPrimitive.Item>) {
  return (
    <CommandPrimitive.Item
      data-slot="command-item"
      className={cn(
        'flex cursor-default select-none items-center gap-3 rounded-md px-3 py-2.5 text-left outline-none data-[disabled=true]:pointer-events-none data-[selected=true]:bg-accent data-[disabled=true]:opacity-50',
        className,
      )}
      {...props}
    />
  );
}
