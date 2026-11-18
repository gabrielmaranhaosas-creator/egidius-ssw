const test=require('node:test'),assert=require('node:assert/strict');
const {load}=require('./carregar-regras.cjs');const {substituirNoJogo}=load('EscalarNoJogo');
const partida=()=>({id:'j1',status:'rascunho',atletasA:['a','b'],atletasB:['c','d'],goleiroA:'a',goleiroB:'c',golsA:1,golsB:0,golsPorAtleta:{b:1}});
test('escalação e goleiro mudam só no jogo escolhido sem alterar o original ou o placar',()=>{
 const j=partida(),antes=structuredClone(j),outro=structuredClone(j);outro.id='j2';
 const novo=substituirNoJogo(j,'A','a','e',['a','b','c','d','e']);
 assert.deepEqual(novo.atletasA,['e','b']);assert.equal(novo.goleiroA,'e');assert.equal(novo.golsA,1);assert.equal(novo.golsPorAtleta.b,1);assert.deepEqual(j,antes);assert.deepEqual(outro.atletasA,['a','b']);
});
test('bloqueia duplicidade, ausência, edição de encerrado e remoção de autor de gol',()=>{
 for(const [j,sai,entra,presentes] of [[partida(),'a','b',['b']],[partida(),'a','e',[]],[{...partida(),status:'encerrada'},'a','e',['e']],[partida(),'b','e',['e']]])assert.throws(()=>substituirNoJogo(j,'A',sai,entra,presentes));
});
test('troca entre times completos funciona com os mesmos presentes e preserva as vagas de goleiro',()=>{
 const j=partida(),n=substituirNoJogo(j,'A','a','c',['a','b','c','d']);assert.deepEqual(n.atletasA,['c','b']);assert.deepEqual(n.atletasB,['a','d']);assert.equal(n.goleiroA,'c');assert.equal(n.goleiroB,'a');assert.equal(n.golsA,j.golsA);assert.deepEqual(j.atletasA,['a','b']);
 assert.throws(()=>substituirNoJogo({...j,golsPorAtleta:{c:1}},'A','a','c',['c']));
});
