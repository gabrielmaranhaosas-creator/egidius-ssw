const test=require('node:test');
const assert=require('node:assert/strict');
const {load}=require('./carregar-regras.cjs');
const fixtures=require('./fixtures-sabado.cjs');
const {assinaturaEquipes,atribuirJogador,copiarEquipes,criarRascunhoTimes,filtrarDistribuicao,proximoNomeTime,reconciliarRascunhoTimes,resumoMontagem,salvarMontagem}=load('TeamBoardRules');
const {jogoDasEquipes}=load('RoundRules');
const times=fixtures.equipes().slice(0,2);
const presentes=fixtures.jogadores().map(j=>j.id);
const dados=()=>({versao:5,jogadores:fixtures.jogadores(),rodadas:[fixtures.rodada([],times),{...fixtures.rodada([],[]),id:'outro',data:'2026-10-24'}]});

test('assinatura ignora a ordem das propriedades, mas detecta nome e elenco alterados',()=>{
  const invertidos=times.map(e=>({atletas:[...e.atletas],nome:e.nome,id:e.id}));
  assert.equal(assinaturaEquipes(times),assinaturaEquipes(invertidos));
  assert.notEqual(assinaturaEquipes(times),assinaturaEquipes(times.map((e,i)=>i?e:{...e,nome:'Outro nome'})));
  const copia=copiarEquipes(times);copia[0].atletas.pop();
  assert.equal(times[0].atletas.length,7);
});
test('cadastro vazio de times usa dois cartões locais sem alterar a formação salva',()=>{
  let i=0;const originais=[];
  const d=criarRascunhoTimes(originais,()=> 'teste-'+(++i));
  assert.equal(d.equipes.length,2);assert.equal(d.origem,'[]');assert.equal(d.editado,false);
  assert.equal(originais.length,0);
});
test('atualização externa carrega quando o formulário não tem ajustes',()=>{
  const r=criarRascunhoTimes(times,()=> 'id');
  const atual=times.map((e,i)=>i?e:{...e,nome:'Atualizado'});
  const novo=reconciliarRascunhoTimes(r,atual,()=> 'id');
  assert.equal(novo.equipes[0].nome,'Atualizado');assert.equal(novo.origem,assinaturaEquipes(atual));
});
test('ajustes locais sobrevivem a uma formação externa diferente',()=>{
  const r={...criarRascunhoTimes(times,()=> 'id'),editado:true,equipes:times.map((e,i)=>i?e:{...e,nome:'Meu ajuste'})};
  const atual=times.map((e,i)=>i?e:{...e,nome:'Atualização externa'});
  assert.strictEqual(reconciliarRascunhoTimes(r,atual,()=> 'id'),r);
  assert.equal(r.equipes[0].nome,'Meu ajuste');
  assert.notEqual(r.origem,assinaturaEquipes(atual));
});
test('edição desfeita ao valor original permite atualização externa sem conflito',()=>{
  const r={...criarRascunhoTimes(times,()=> 'id'),editado:true};
  const atual=times.map((e,i)=>i?e:{...e,nome:'Atualizado'});
  assert.equal(reconciliarRascunhoTimes(r,atual,()=> 'id').equipes[0].nome,'Atualizado');
});
test('resumo separa disponíveis e escalados sem produzir contagens negativas',()=>{
  const r=resumoMontagem(times,presentes);
  assert.equal(r.disponiveis.length,7);assert.equal(r.escalados,14);assert.equal(r.completos,2);
  const invalido=resumoMontagem([{...times[0],atletas:[...times[0].atletas,'ausente']}],['teste-atleta-1']);
  assert.equal(invalido.disponiveis.length,0);assert.equal(invalido.escalados,1);assert.equal(invalido.semPresenca.length,7);
});
test('transferência para time cheio é recusada sem remover a origem',()=>{
  const before=JSON.stringify(times);
  assert.throws(()=>atribuirJogador(times,presentes,times[0].atletas[0],times[1].id),/7 jogadores/);
  assert.equal(JSON.stringify(times),before);
});
test('retirar e transferir para uma vaga preserva os demais jogadores',()=>{
  const id=times[0].atletas[0];
  const livres=atribuirJogador(times,presentes,times[1].atletas[0],'');
  const novo=atribuirJogador(livres,presentes,id,times[1].id);
  assert.equal(novo[0].atletas.includes(id),false);assert.equal(novo[1].atletas.includes(id),true);
  assert.equal(novo[1].atletas.length,7);assert.equal(times[0].atletas.length,7);
  assert.strictEqual(atribuirJogador(times,presentes,id,times[0].id),times);
});
test('destino removido ou jogador sem presença não muda a formação',()=>{
  assert.throws(()=>atribuirJogador(times,presentes,'ausente',times[0].id),/chegada/);
  assert.throws(()=>atribuirJogador(times,presentes,times[0].atletas[0],'removido'),/não existe/);
});
test('nome de novo time não repete número que já está em uso',()=>{
  assert.equal(proximoNomeTime([...times,{id:'c',nome:' Time 3 ',atletas:[]},{id:'d',nome:'time 5',atletas:[]}]),'Time 4');
});
test('busca e filtros preservam a ordem de chegada e a formação',()=>{
  const jogadores=[{id:'teste-atleta-15',nome:'José de Teste'},{id:times[0].atletas[0],nome:'Álvaro'},{id:times[1].atletas[0],nome:'Bruno'}];
  assert.deepEqual(filtrarDistribuicao(jogadores,times,'jose','todos').map(j=>j.id),['teste-atleta-15']);
  assert.deepEqual(filtrarDistribuicao(jogadores,times,'','disponiveis').map(j=>j.id),['teste-atleta-15']);
  assert.deepEqual(filtrarDistribuicao(jogadores,times,'','time:'+times[1].id).map(j=>j.id),[times[1].atletas[0]]);
  assert.equal(filtrarDistribuicao(jogadores,times,'inexistente','todos').length,0);
  assert.deepEqual(jogadores.map(j=>j.nome),['José de Teste','Álvaro','Bruno']);
});
test('gravação usa a formação atual e rejeita uma referência antiga',()=>{
  const d=dados();const origem=assinaturaEquipes(times);
  const atuais=times.map((e,i)=>i?e:{...e,nome:'Mudou em outra sessão'});
  const concorrente={...d,rodadas:[{...d.rodadas[0],equipes:atuais},d.rodadas[1]]};
  const before=JSON.stringify(concorrente);
  assert.throws(()=>salvarMontagem(concorrente,d.rodadas[0].id,origem,times),/formação salva mudou/);
  assert.equal(JSON.stringify(concorrente),before);
});
test('presença ou cadastro removidos durante a montagem bloqueiam a gravação',()=>{
  const d=dados();const origem=assinaturaEquipes(times);
  const semPresenca={...d,rodadas:[{...d.rodadas[0],presencas:d.rodadas[0].presencas.slice(1)},d.rodadas[1]]};
  assert.throws(()=>salvarMontagem(semPresenca,d.rodadas[0].id,origem,times),/presença/);
  assert.throws(()=>salvarMontagem({...d,jogadores:d.jogadores.slice(1)},d.rodadas[0].id,origem,times),/cadastro/);
  assert.throws(()=>salvarMontagem(d,'removida',origem,times),/sábado não existe/);
});
test('resultado novo protege a formação mesmo quando os nomes não mudaram',()=>{
  const d=dados();const jogo={...jogoDasEquipes(1,'teste-jogo',...times),golsA:1};
  const atualizado={...d,rodadas:[{...d.rodadas[0],jogos:[jogo]},d.rodadas[1]]};
  assert.throws(()=>salvarMontagem(atualizado,d.rodadas[0].id,assinaturaEquipes(times),times),/protegidos/);
});
test('salvar atualiza o rascunho vinculado, preservando outro sábado e súmula histórica',()=>{
  const d=dados();const jogo=jogoDasEquipes(1,'rascunho',...times);
  const antigo={...jogo,id:'historico',status:'encerrada',vinculoFormacao:false,equipeIdA:null,equipeIdB:null,golsA:4};
  d.rodadas[0].jogos=[jogo,antigo];
  const novos=times.map((e,i)=>i?e:{...e,nome:' Novo nome '});
  const result=salvarMontagem(d,d.rodadas[0].id,assinaturaEquipes(times),novos);
  assert.equal(result.rodadas[0].equipes[0].nome,'Novo nome');
  assert.equal(result.rodadas[0].jogos[0].timeA,'Novo nome');
  assert.strictEqual(result.rodadas[0].jogos[1],antigo);assert.strictEqual(result.rodadas[1],d.rodadas[1]);
  assert.equal(d.rodadas[0].equipes[0].nome,times[0].nome);
});
test('gravação mantém as regras de nomes, duplicidade, limite e presença',()=>{
  const d=dados(),origem=assinaturaEquipes(times);
  assert.throws(()=>salvarMontagem(d,d.rodadas[0].id,origem,times.slice(0,1)),/pelo menos dois/);
  assert.throws(()=>salvarMontagem(d,d.rodadas[0].id,origem,times.map(e=>({...e,nome:'Igual'}))),/nomes diferentes/);
  assert.throws(()=>salvarMontagem(d,d.rodadas[0].id,origem,[...times,...Array.from({length:15},(_,i)=>({id:'x'+i,nome:'X'+i,atletas:[]}))]),/16 times/);
});
