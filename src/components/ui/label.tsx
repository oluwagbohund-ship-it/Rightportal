import * as React from 'react';
import { cn } from '../../lib/utils.ts';

export const Label = React.forwardRef<
  HTMLLabelElement,
  React.LabelHTMLAttributes<HTMLLabelElement>
>(({ className, ...props }, ref) => (
  <label
    ref={ref}
    className={cn('text-sm font-medium text-[#0F172A] leading-none', className)}
    {...props}
  />
));
Label.displayName = 'Label';
