import type { DadosSSW } from './SSWStore';
type Passo=string|{id:string};
export type Divergencia={caminho:Passo[];rotulo:string;local:unknown;remoto:unknown};
export type Mescla={data:DadosSSW|null;parcial:DadosSSW;conflitos:string[];divergencias:Divergencia[]};
const igual=(a:unknown,b:unknown):boolean=>{
 if(a===b)return true;
 if(Array.isArray(a)&&Array.isArray(b))return a.length===b.length&&a.every((v,i)=>igual(v,b[i]));
 if(a&&b&&typeof a==='object'&&typeof b==='object'){const x=a as Record<string,unknown>,y=b as Record<string,unknown>;return Object.keys(x).length===Object.keys(y).length&&Object.keys(x).every(k=>Object.hasOwn(y,k)&&igual(x[k],y[k]));}
 return false;
};
/** Mescla apenas edições independentes. A mesma partida exige uma decisão única. */
export function mesclarEstados(base:DadosSSW,local:DadosSSW,remoto:DadosSSW):Mescla{
 const conflitos:string[]=[],divergencias:Divergencia[]=[];
 function conflito(l:unknown,r:unknown,path:string,caminho:Passo[]){conflitos.push(path);divergencias.push({caminho,rotulo:path,local:l,remoto:r});return l;}
 function merge(b:unknown,l:unknown,r:unknown,path:string,caminho:Passo[]):unknown{
  if(igual(l,b))return r;if(igual(r,b)||igual(l,r))return l;
  if(caminho.at(-2)==='jogos' && typeof caminho.at(-1)==='object')return conflito(l,r,path,caminho);
  if(Array.isArray(b)&&Array.isArray(l)&&Array.isArray(r)&&[...b,...l,...r].every(v=>v&&typeof v==='object'&&typeof v.id==='string')){
   const maps=[b,l,r].map(xs=>new Map(xs.map(x=>[x.id,x])));const ids=[...new Set([...r,...l,...b].map(x=>x.id))];
   return ids.map(id=>merge(maps[0].get(id),maps[1].get(id),maps[2].get(id),`${path}[${id}]`,[...caminho,{id}])).filter(x=>x!==undefined);
  }
  if(b&&l&&r&&!Array.isArray(b)&&!Array.isArray(l)&&!Array.isArray(r)&&typeof b==='object'&&typeof l==='object'&&typeof r==='object'){
   const x=b as Record<string,unknown>,y=l as Record<string,unknown>,z=r as Record<string,unknown>;const out:Record<string,unknown>={};
   for(const k of new Set([...Object.keys(x),...Object.keys(y),...Object.keys(z)])){const value=merge(x[k],y[k],z[k],path?`${path}.${k}`:k,[...caminho,k]);if(value!==undefined)Object.defineProperty(out,k,{value,enumerable:true,writable:true,configurable:true});}return out;
  }
  return conflito(l,r,path,caminho);
 }
 const parcial=merge(base,local,remoto,'',[]) as DadosSSW;
 return {data:conflitos.length?null:parcial,parcial,conflitos,divergencias};
}
/** Aplica escolhas por caminho estruturado; nunca interpreta IDs como código ou caminho textual. */
export function aplicarEscolhas(mescla:Mescla,escolhas:Record<number,'local'|'remoto'>):DadosSSW{
 let data:unknown=JSON.parse(JSON.stringify(mescla.parcial));
 function trocar(node:unknown,path:Passo[],value:unknown):unknown{
  if(!path.length)return value;
  const [head,...rest]=path;
  if(typeof head==='string'){
   if(!node||typeof node!=='object'||Array.isArray(node))throw Error('O registro mudou. Refaça a conferência.');
   const out={...node} as Record<string,unknown>,next=trocar(out[head],rest,value);
   if(next===undefined)delete out[head];else Object.defineProperty(out,head,{value:next,enumerable:true,writable:true,configurable:true});return out;
  }
  if(!Array.isArray(node))throw Error('A lista mudou. Refaça a conferência.');
  const index=node.findIndex(x=>x.id===head.id),out=[...node];const next=trocar(index<0?undefined:out[index],rest,value);
  if(index<0){if(next!==undefined)out.push(next);}else if(next===undefined)out.splice(index,1);else out[index]=next;
  return out;
 }
 mescla.divergencias.forEach((d,i)=>{if(!escolhas[i])throw Error('Escolha qual versão manter para cada registro.');data=trocar(data,d.caminho,d[escolhas[i]]);});
 return data as DadosSSW;
}
