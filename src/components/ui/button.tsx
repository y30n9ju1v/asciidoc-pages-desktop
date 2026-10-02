import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';
import { buttonVariants } from './button-variants';

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<'button'> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  // `Slot | 'button'` narrows props to their incompatible intersection with
  // current React/Radix types. Both are valid element targets for these props.
  const Comp: React.ElementType = asChild ? Slot : 'button';

  return <Comp data-slot="button" className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}

export { Button };
