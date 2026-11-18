const test=require('node:test'),assert=require('node:assert/strict');
const {load}=require('./carregar-regras.cjs');const {substituirNoJogo}=load('EscalarNoJogo');
const partida=()=>({id:'j1',status:'rascunho',atletasA:['a','b'],atletasB:['c','d'],goleiroA:'a',goleiroB:'c',golsA:1,golsB:0,golsPorAtleta:{b:1}});
test('escalação e goleiro mudam só no jogo escolhido sem alterar o original ou o placar',()=>{
 const j=partida(),antes=structuredClone(j),outro=structuredClone(j);outro.id='j2';
 const novo=substituirNoJogo(j,'A','a','e',['a','b','c','d','e']);
 assert.deepEqual(novo.atletasA,['e','b']);assert.equal(novo.goleiroA,'e');assert.equal(novo.golsA,1);assert.equal(novo.golsPorAtleta.b,1);assert.deepEqual(j,antes);assert.deepEqual(outro.atletasA,['a','b']);
});
test('bloqueia duplicidade, ausência, edição de encerrado e remoção de autor de gol',()=>{
 for(const [j,sai,entra,presentes] of [[partida(),'a','c',['c']],[partida(),'a','e',[]],[{...partida(),status:'encerrada'},'a','e',['e']],[partida(),'b','e',['e']]])assert.throws(()=>substituirNoJogo(j,'A',sai,entra,presentes));
});
