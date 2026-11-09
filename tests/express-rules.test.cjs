const test=require('node:test');
const assert=require('node:assert/strict');
const {load}=require('./carregar-regras.cjs');
const fixtures=require('./fixtures-sabado.cjs');
const {jogoDasEquipes}=load('RoundRules');
const {pendenciasEncerramento,validarEncerramento,encerrarPartida,reabrirPartidaDaRodada,alterarPlacar,lancarGol,atualizarPartidaDaRodada}=load('ExpressRules');
const times=fixtures.equipes().slice(0,2);
const a=times[0].atletas[0], b=times[1].atletas[0];
const partida={...jogoDasEquipes(1,'j1',...times),goleiroA:a,goleiroB:b};
test('0 × 0 pode encerrar com 7 por time e goleiros escolhidos',()=>{
  assert.equal(validarEncerramento(partida),null);
  assert.equal(encerrarPartida(partida).status,'encerrada');
  assert.equal(partida.status,'rascunho');
});
test('conferência lista todas as pendências sem alterar a partida',()=>{
  const g={...partida,goleiroA:null,goleiroB:null,golsA:1};
  const antes=JSON.stringify(g);
  assert.deepEqual(pendenciasEncerramento(g).map(p=>p.codigo),['goleiro-A','goleiro-B','sem-autoria']);
  assert.equal(JSON.stringify(g),antes);
});
test('gol com autoria atualiza placar e não aceita atleta adversário',()=>{
  const p=lancarGol(partida,'A',a,1);
  assert.equal(p.golsA,1);assert.equal(p.golsPorAtleta[a],1);
  assert.throws(()=>lancarGol(partida,'A',b,1),/equipe/);
});
test('placar não fica negativo nem abaixo da autoria',()=>{
  assert.throws(()=>alterarPlacar(partida,'A',-1),/0 e 99/);
  assert.throws(()=>alterarPlacar(lancarGol(partida,'A',a,1),'A',-1),/Retire primeiro/);
});
test('gols sem autoria exigem autorização explícita',()=>{
  const p=alterarPlacar(partida,'B',1);
  assert.match(validarEncerramento(p),/sem autor/);
  assert.equal(validarEncerramento({...p,permitirGolsSemAutor:true}),null);
});
test('autorização não permite excesso nem gols de quem não está escalado',()=>{
  assert.match(validarEncerramento({...partida,golsPorAtleta:{[a]:1},permitirGolsSemAutor:true}),/ultrapassa/);
  assert.match(validarEncerramento({...partida,golsPorAtleta:{desconhecido:1},permitirGolsSemAutor:true}),/somente atletas/);
});
test('escalação incompleta, repetida ou goleiro adversário bloqueiam encerramento',()=>{
  assert.match(validarEncerramento({...partida,atletasA:partida.atletasA.slice(0,6)}),/7 jogadores/);
  assert.match(validarEncerramento({...partida,atletasB:[a,...partida.atletasB.slice(1)]}),/duplicidade/);
  assert.match(validarEncerramento({...partida,goleiroA:b}),/goleiro/);
});
for(const n of [-1,.5,NaN,Infinity,100]) {
  test('encerramento rejeita placar inválido: '+n,()=>assert.throws(()=>encerrarPartida({...partida,golsA:n}),/inteiros/));
}
test('autoria fracionária também é rejeitada',()=>{
  assert.match(validarEncerramento({...partida,golsA:1,golsPorAtleta:{[a]:.5}}),/inteiros/);
});
test('reabrir preserva placar, autores e outros jogos',()=>{
  const fechado=encerrarPartida(lancarGol(partida,'A',a,1));
  const outra={...fechado,id:'j2',numero:2};
  const r=fixtures.rodada([fechado,outra],times);
  const novo=reabrirPartidaDaRodada(r,'j1');
  assert.equal(novo.jogos[0].status,'rascunho');
  assert.equal(novo.jogos[0].golsA,1);assert.deepEqual(novo.jogos[0].golsPorAtleta,{[a]:1});
  assert.strictEqual(novo.jogos[1],outra);assert.equal(fechado.status,'encerrada');
  assert.throws(()=>reabrirPartidaDaRodada(novo,'j1'),/já está em edição/);
  assert.throws(()=>reabrirPartidaDaRodada(r,'inexistente'),/não encontrada/);
});
test('encerrado não aceita edições por uma ação desatualizada',()=>{
  const fechado=encerrarPartida(partida);
  assert.throws(()=>encerrarPartida(fechado),/já está encerrada/);
  assert.throws(()=>atualizarPartidaDaRodada(fixtures.rodada([fechado],times),'j1',g=>alterarPlacar(g,'A',1)),/encerrada/);
});
test('partida de outro sábado é rejeitada; demais partidas são preservadas',()=>{
  const r=fixtures.rodada([partida,{...partida,id:'j2'}],times);
  assert.throws(()=>atualizarPartidaDaRodada(r,'outro',g=>g),/não encontrada/);
  const novo=atualizarPartidaDaRodada(r,'j1',g=>alterarPlacar(g,'A',1));
  assert.equal(novo.jogos[0].golsA,1);assert.strictEqual(novo.jogos[1],r.jogos[1]);
});
