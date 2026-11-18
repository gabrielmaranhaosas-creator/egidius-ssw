import type { DadosSSW } from './SSWStore';
import { ehSabado } from './SSWStore';
/** Criar é explícito; abrir uma data existente nunca duplica nem limpa seus registros. */
export function prepararSabado(dados:DadosSSW,data:string,id:string):{dados:DadosSSW;id:string}{
  if(!ehSabado(data))throw Error('Escolha uma data que seja sábado.');
  const existente=dados.rodadas.find(r=>r.data===data);
  if(existente)return {dados,id:existente.id};
  if(!id||dados.rodadas.some(r=>r.id===id))throw Error('Não foi possível identificar o novo sábado. Tente novamente.');
  return {dados:{...dados,rodadas:[...dados.rodadas,{id,data,presencas:[],equipes:[],jogos:[]}]},id};
}
