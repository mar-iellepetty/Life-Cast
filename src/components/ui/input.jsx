import {forwardRef} from 'react';
export const Input=forwardRef(function Input(/** @type {import('react').InputHTMLAttributes<HTMLInputElement>} */ {className='',...p},ref){return <input ref={ref} className={'flex h-10 w-full rounded-md border px-3 py-2 text-base '+className} {...p}/>});
