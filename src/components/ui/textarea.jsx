import {forwardRef} from 'react';
export const Textarea=forwardRef(function Textarea(/** @type {import('react').TextareaHTMLAttributes<HTMLTextAreaElement>} */ {className='',...p},ref){return <textarea ref={ref} className={'w-full rounded-md border p-3 text-base '+className} {...p}/>});
