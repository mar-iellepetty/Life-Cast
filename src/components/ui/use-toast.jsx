import {toast as notify} from 'sonner';
export function useToast(){return {toast:({title,description,variant=''})=>variant==='destructive'?notify.error(title,{description}):notify(title,{description})};}
