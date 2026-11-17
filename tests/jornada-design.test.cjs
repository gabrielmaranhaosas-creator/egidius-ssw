const test=require('node:test'),assert=require('node:assert/strict');
const {criarCarregador}=require('./carregar-regras.cjs');
const f=require('./fixtures-sabado.cjs');
const {load}=criarCarregador();const jornada=load('JornadaSabado').jornadaSabado;
function base(){return {versao:5,jogadores:f.jogadores(),rodadas:[f.rodada([],f.equipes().slice(0,2))]};}
test('primeiro uso conduz à criação e ao cadastro sem criar dados implicitamente',()=>{
 const d={versao:5,jogadores:[],rodadas:[]};const antes=JSON.stringify(d);
 assert.equal(jornada(undefined,d).destino,'rodadas');assert.equal(JSON.stringify(d),antes);
 d.rodadas=[{id:'r',data:'2026-11-14',presencas:[],equipes:[],jogos:[]}];assert.equal(jornada(d.rodadas[0],d).destino,'cadastro');
});
test('jornada acompanha chegadas, montagem manual e preparação; nunca escolhe elenco',()=>{
 const d=base(),r=d.rodadas[0];r.equipes=[];r.presencas=[];
 assert.equal(jornada(r,d).tipo,'chegadas');r.presencas=d.jogadores.slice(0,13).map(j=>j.id);assert.match(jornada(r,d).texto,/faltam 1 jogador/);
 r.presencas=d.jogadores.slice(0,14).map(j=>j.id);assert.equal(jornada(r,d).destino,'times');assert.match(jornada(r,d).acao,/manualmente/);assert.equal(r.equipes.length,0);
 r.equipes=f.equipes().slice(0,2);const antes=JSON.stringify(d);const next=jornada(r,d);assert.equal(next.tipo,'sumula');assert.equal(next.jogoId,'__novo_jogo__');assert.equal(JSON.stringify(d),antes);
});
test('partida aberta prevalece sobre times incompletos e permite retomar o jogo correto',()=>{
 const d=base(),r=d.rodadas[0],game=load('RoundRules').jogoDasEquipes(3,'em-edicao',...r.equipes);
 r.jogos=[{...game,id:'posterior',numero:4},game];r.equipes=[];
 const next=jornada(r,d);assert.equal(next.jogoId,'em-edicao');assert.equal(next.etapa,2);assert.match(next.acao,/jogo 3/);
});
test('resultados encerrados ficam preservados ao preparar a próxima partida',()=>{
 const d=base(),r=d.rodadas[0];r.jogos=[{...load('RoundRules').jogoDasEquipes(1,'fechado',...r.equipes),status:'encerrada',golsA:2,golsB:1}];
 const antes=JSON.stringify(r.jogos);assert.equal(jornada(r,d).jogoId,'__novo_jogo__');assert.equal(JSON.stringify(r.jogos),antes);
});
test('presença histórica não faz jogador que saiu contar como disponível para novo jogo',()=>{
 const d=base(),r=d.rodadas[0];r.indisponiveis=[r.presencas[0]];r.equipes[0].atletas.shift();
 const next=jornada(r,d);assert.equal(next.destino,'presencas');assert.equal(next.acao,'Revisar disponibilidade');
});
