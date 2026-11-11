import test from 'node:test';
import assert from 'node:assert/strict';
import loader from './carregar-regras.cjs';
import fixtures from './fixtures-sabado.cjs';
const { marcarTodos, limparPresencasLivres, podeExcluirAtleta, excluirRascunhos, duplicarJogo, ajustarGol }=loader.load('QuickActions');
const { jogoDasEquipes }=loader.load('RoundRules');
const equipes=fixtures.equipes().slice(0,2);
const atletas=fixtures.jogadores(equipes);
const a=equipes[0].atletas[0], b=equipes[1].atletas[0];
const jogo=jogoDasEquipes(1,'j1',...equipes);
const rodada={...fixtures.rodada([jogo],equipes),presencas:[a]};
test('marcar todos preserva a chegada anterior e não duplica',()=>{
  const novo=marcarTodos(rodada,atletas);
  assert.equal(novo.presencas[0],a);assert.equal(novo.presencas.length,14);
  assert.deepEqual(marcarTodos(novo,atletas).presencas,novo.presencas);
});
test('limpeza e exclusão preservam os atletas com participação',()=>{
  const r={...rodada,presencas:['livre',a,b]};
  assert.deepEqual(limparPresencasLivres(r).presencas,[a,b]);
  assert.equal(podeExcluirAtleta({versao:5,jogadores:atletas,rodadas:[rodada]},a),false);
  assert.equal(podeExcluirAtleta({versao:5,jogadores:atletas,rodadas:[rodada]},'livre'),true);
});
test('exclusão em lote não aceita jogos encerrados',()=>{
  const fechado={...jogo,id:'j2',numero:2,status:'encerrada'};
  const r={...rodada,jogos:[jogo,fechado]};
  assert.deepEqual(excluirRascunhos(r,['j1']).jogos.map(j=>j.id),['j2']);
  assert.throws(()=>excluirRascunhos(r,['j1','j2']),/encerrado/);
  assert.equal(excluirRascunhos(r,[]),r);
});
test('duplicar conserva a escalação e zera os resultados',()=>{
  const g={...jogo,status:'encerrada',golsA:3,golsB:1,golsPorAtleta:{[a]:3},goleiroA:a,observacoes:'teste'};
  const novo=duplicarJogo(g,'j3',3);
  assert.deepEqual(novo.atletasA,equipes[0].atletas);assert.notStrictEqual(novo.atletasA,g.atletasA);
  assert.equal(novo.golsA,0);assert.equal(novo.goleiroA,null);
  assert.deepEqual(novo.golsPorAtleta,{});assert.equal(novo.status,'rascunho');
});
test('gol de um toque respeita autoria e placares previamente informados',()=>{
  const g1=ajustarGol(jogo,a,'A',1);
  assert.equal(g1.golsA,1);assert.equal(g1.golsPorAtleta[a],1);
  assert.equal(ajustarGol(g1,a,'A',-1).golsA,0);
  const g3=ajustarGol({...jogo,golsA:3},a,'A',1);
  assert.equal(g3.golsA,3);assert.equal(g3.golsPorAtleta[a],1);
  assert.equal(ajustarGol(g3,a,'A',-1).golsA,3);
  assert.throws(()=>ajustarGol({...g1,status:'encerrada'},a,'A',1),/Reabra/);
});
