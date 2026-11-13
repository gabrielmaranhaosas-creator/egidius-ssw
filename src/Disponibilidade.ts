import type { DadosSSW } from './SSWStore';
/** Disponibilidade futura é independente da presença e da escalação histórica. */
export function definirDisponibilidade(dados:DadosSSW,rodadaId:string,jogadorId:string,disponivel:boolean):DadosSSW{
 const rodada=dados.rodadas.find(r=>r.id===rodadaId);
 if(!rodada||!rodada.presencas.includes(jogadorId))throw new Error('Confirme a presença antes de alterar a disponibilidade.');
 const saidas=new Set(rodada.indisponiveis??[]);
 if(disponivel)saidas.delete(jogadorId);else saidas.add(jogadorId);
 return {...dados,rodadas:dados.rodadas.map(r=>r.id===rodadaId?{...r,indisponiveis:[...saidas],equipes:disponivel?r.equipes:r.equipes.map(e=>({...e,atletas:e.atletas.filter(id=>id!==jogadorId)}))}:r)};
}
