import { useSyncExternalStore } from 'react';
export type Papel='viewer'|'operator'|'admin';
let papel:Papel='viewer';
const listeners=new Set<()=>void>();
export function definirPapel(value:Papel){papel=value;listeners.forEach(fn=>fn());}
export function usePapel(){return useSyncExternalStore(fn=>{listeners.add(fn);return()=>{listeners.delete(fn);};},()=>papel,()=> 'viewer' as Papel);}
