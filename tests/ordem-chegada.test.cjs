const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./carregar-regras.cjs');
const { ordenarChegadas } = load('QuickActions');

test('a ordem de presença prevalece sobre o cadastro e novos check-ins entram na sequência', () => {
  const jogadores = [
    { id: 'a', nome: 'Ana' }, { id: 'b', nome: 'Bruno' },
    { id: 'c', nome: 'Carlos' }, { id: 'd', nome: 'Dora' },
  ];
  const presencas = ['c', 'b'];
  const exibir = ids => ordenarChegadas(ids, jogadores).map(({ jogador, posicao }) => [jogador.id, posicao]);
  assert.equal(JSON.stringify(exibir(presencas)), JSON.stringify([['c', 1], ['b', 2], ['a', undefined], ['d', undefined]]));
  assert.equal(JSON.stringify(exibir([...presencas, 'd'])), JSON.stringify([['c', 1], ['b', 2], ['d', 3], ['a', undefined]]));
  assert.equal(JSON.stringify(exibir(['b', 'd'])), JSON.stringify([['b', 1], ['d', 2], ['a', undefined], ['c', undefined]]));
  assert.deepEqual(presencas, ['c', 'b']);
  assert.deepEqual(jogadores.map(j => j.id), ['a', 'b', 'c', 'd']);
});
