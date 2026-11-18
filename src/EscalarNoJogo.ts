import type { Partida } from './SSWStore';
import type { Lado } from './ExpressRules';
/** Altera somente a escalação desta partida; não reescreve autoria já registrada. */
export function substituirNoJogo(jogo:Partida,lado:Lado,sai:string,entra:string,presentes:string[]):Partida {
  if(jogo.status!=='rascunho')throw Error('Reabra esta partida antes de editar.');
  const campo=lado==='A'?'atletasA':'atletasB';
  const keeper=lado==='A'?'goleiroA':'goleiroB';
  if(!jogo[campo].includes(sai))throw Error('O jogador já não está nesta escalação.');
  if(sai===entra)return jogo;
  if(!presentes.includes(entra))throw Error('Confirme a presença de quem vai entrar.');
  if([...jogo.atletasA,...jogo.atletasB].includes(entra))throw Error('Esse jogador já está nesta partida.');
  if(jogo.golsPorAtleta[sai])throw Error('Este jogador tem gols registrados. Corrija a autoria antes de substituir sua escalação.');
  const gols={...jogo.golsPorAtleta};delete gols[sai];
  return {...jogo,[campo]:jogo[campo].map(id=>id===sai?entra:id),[keeper]:jogo[keeper]===sai?entra:jogo[keeper],golsPorAtleta:gols};
}
