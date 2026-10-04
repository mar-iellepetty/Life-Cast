import * as P from '@radix-ui/react-popover';
export const Popover=P.Root,PopoverTrigger=P.Trigger;
export const PopoverContent=({className='',...p})=><P.Portal><P.Content sideOffset={8} className={'z-50 rounded-lg border p-4 '+className} {...p}/></P.Portal>;
