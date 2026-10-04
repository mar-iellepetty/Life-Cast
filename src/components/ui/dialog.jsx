import * as D from '@radix-ui/react-dialog';
import { forwardRef } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
export const Dialog=D.Root,DialogTrigger=D.Trigger,DialogTitle=D.Title,DialogDescription=D.Description;
export const DialogHeader=(/** @type {import('react').HTMLAttributes<HTMLDivElement>} */ {className,...p})=><div className={cn('space-y-2',className)} {...p}/>;
export const DialogContent=forwardRef(function DialogContent(/** @type {import('@radix-ui/react-dialog').DialogContentProps} */ {className,children,...p},ref){return <D.Portal><D.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"/><D.Content ref={ref} className={cn('fixed left-1/2 top-1/2 z-50 grid w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 gap-5 rounded-2xl border bg-white p-6 shadow-2xl max-h-[90dvh] overflow-y-auto',className)} {...p}>{children}<D.Close aria-label="Close" className="absolute right-4 top-4 rounded-full p-1 hover:bg-black/10"><X size={18}/></D.Close></D.Content></D.Portal>});
