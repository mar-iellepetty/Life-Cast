import { forwardRef } from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cn } from '@/lib/utils';
export const Button=forwardRef(function Button(/** @type {import('react').ButtonHTMLAttributes<HTMLButtonElement> & {asChild?: boolean, variant?: string}} */ {asChild,variant,className,...props},ref){const C=asChild?Slot:'button';return <C ref={ref} className={cn('inline-flex min-h-10 items-center justify-center rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:opacity-40 disabled:pointer-events-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-600',variant==='outline'?'border border-[#E9E0D4]':'',className)} {...props}/>});
