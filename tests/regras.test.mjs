import test from 'node:test';
import assert from 'node:assert/strict';
import loader from './carregar-regras.cjs';
import fixtures from './fixtures-sabado.cjs';
const { validarEquipes, jogoDasEquipes, equipesBloqueadas, atualizarRascunhosVinculados, aplicarEquipes, confrontoSugerido } = loader.load('RoundRules');
const equipes = fixtures.equipes();
const rodada = (jogos=[], times=equipes) => fixtures.rodada(jogos,times);

test('aceita 3 equipes; impede repetição de atleta, nome e ausência', () => {
  assert.equal(validarEquipes(equipes,rodada().presencas),null);
  assert.match(validarEquipes(equipes.slice(0,1),rodada().presencas),/pelo menos dois/);
  assert.match(validarEquipes([...equipes.slice(0,2),{...equipes[2],nome:'branco'}],rodada().presencas),/nomes diferentes/);
  assert.match(validarEquipes([...equipes.slice(0,2),{...equipes[2],atletas:[equipes[0].atletas[0]]}],rodada().presencas),/mesmo atleta/);
  assert.match(validarEquipes(equipes,rodada().presencas.slice(1)),/presença/);
});
test('confrontos copiam somente os dois elencos escolhidos', () => {
  const g1=jogoDasEquipes(1,'j1',equipes[0],equipes[1]);
  const g2=jogoDasEquipes(2,'j2',equipes[2],equipes[0]);
  assert.deepEqual(g1.atletasA,equipes[0].atletas);
  assert.deepEqual(g1.atletasB,equipes[1].atletas);
  assert.deepEqual(g2.atletasA,equipes[2].atletas);
  assert.notStrictEqual(g1.atletasA,equipes[0].atletas);
  g1.golsA=3;
  assert.equal(g2.golsA,0);
  assert.throws(()=>jogoDasEquipes(3,'j3',equipes[0],equipes[0]),/diferentes/);
  assert.throws(()=>jogoDasEquipes(4,'j4',{...equipes[0],atletas:equipes[0].atletas.slice(0,6)},equipes[1]),/7 jogadores/);
});
test('resultado permanece intacto enquanto a montagem futura muda', () => {
  const jogo={...jogoDasEquipes(1,'j1',equipes[0],equipes[1]),status:'encerrada'};
  assert.equal(equipesBloqueadas(rodada([jogo])),false);
  assert.strictEqual(atualizarRascunhosVinculados(rodada([jogo]),equipes).jogos[0],jogo);
});
test('montagem preserva cada escalação já criada, incluindo rascunhos', () => {
  const antigo={...jogoDasEquipes(1,'legacy',equipes[0],equipes[1]),vinculoFormacao:false,equipeIdA:null,equipeIdB:null,status:'encerrada'};
  const jogo=jogoDasEquipes(2,'j2',equipes[2],equipes[0]);
  const alterados=equipes.map(e=>({...e,atletas:[...e.atletas]}));
  alterados[2].atletas=equipes[2].atletas.slice(0,1);
  const atualizado=atualizarRascunhosVinculados(rodada([antigo,jogo]),alterados);
  assert.strictEqual(atualizado.jogos[0],antigo);
  assert.deepEqual(atualizado.jogos[1].atletasA,jogo.atletasA);
  assert.deepEqual(atualizado.jogos[1].atletasB,equipes[0].atletas);
});
test('último confronto é sugerido; vinculação preserva placar e notas', () => {
  const anterior=jogoDasEquipes(2,'j2',equipes[2],equipes[1]);
  assert.deepEqual(confrontoSugerido(rodada([anterior])),{a:equipes[2].id,b:equipes[1].id});
  assert.deepEqual(confrontoSugerido(rodada()),{a:equipes[0].id,b:equipes[1].id});
  const legado={...jogoDasEquipes(1,'old',equipes[0],equipes[1]),vinculoFormacao:false,equipeIdA:null,equipeIdB:null,golsA:2,golsB:1,observacoes:'teste',golsPorAtleta:{[equipes[0].atletas[0]]:2}};
  assert.throws(()=>aplicarEquipes(legado,equipes[2],equipes[1]),/já tem gols/);
  const zerado={...legado,golsA:0,golsB:0,golsPorAtleta:{}};
  const vinculado=aplicarEquipes(zerado,equipes[2],equipes[1]);
  assert.equal(vinculado.observacoes,'teste');assert.equal(vinculado.equipeIdA,equipes[2].id);
  assert.throws(()=>aplicarEquipes({...zerado,status:'encerrada'},equipes[2],equipes[1]),/Reabra/);
});
