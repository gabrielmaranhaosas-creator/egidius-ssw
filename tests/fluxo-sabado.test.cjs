const test=require('node:test');
const assert=require('node:assert/strict');
const {load,criarCarregador}=require('./carregar-regras.cjs');
const fixtures=require('./fixtures-sabado.cjs');
const {statusRodada,checkInCentral,retirarChegada}=load('CampoRules');
const {jogoDasEquipes,validarEquipes}=load('RoundRules');
const {distribuirPorChegadaAteSete}=load('TimeRules');
const {encerrarPartida,lancarGol,reabrirPartidaDaRodada}=load('ExpressRules');
const {excluirRascunhosParaLixeira,restaurarDaLixeira}=load('LixeiraRules');
const times=fixtures.equipes().slice(0,2);

test('central orienta a criação quando não há sábado',()=>{
  assert.equal(statusRodada().destino,'rodadas');
  assert.equal(statusRodada().timesCompletos,0);
});
test('dois times incompletos não liberam a primeira partida',()=>{
  const r=fixtures.rodada([],times.map(e=>({...e,atletas:e.atletas.slice(0,1)})));
  const p=statusRodada(r);
  assert.equal(p.equipes,2);assert.equal(p.timesCompletos,0);
  assert.equal(p.confrontoPronto,false);assert.equal(p.destino,'times');
});
test('central exige sete jogadores presentes e distintos em cada time',()=>{
  const r=fixtures.rodada([],times);
  assert.equal(statusRodada(r).confrontoPronto,true);
  assert.equal(statusRodada(r).destino,'confronto');
  assert.equal(statusRodada({...r,presencas:r.presencas.slice(1)}).timesCompletos,1);
  const repetido=[times[0],{...times[1],atletas:[times[0].atletas[0],...times[1].atletas.slice(1)]}];
  assert.equal(statusRodada(fixtures.rodada([],repetido)).confrontoPronto,false);
});
test('súmula em edição tem prioridade; após encerramento sugere próximo confronto',()=>{
  const g=jogoDasEquipes(1,'j1',...times);
  const r=fixtures.rodada([g],times);
  assert.equal(statusRodada(r).destino,'partidas');
  assert.equal(statusRodada({...r,jogos:[{...g,status:'encerrada'}]}).destino,'confronto');
});
test('zero presenças pede check-in antes da montagem',()=>{
  assert.equal(statusRodada({...fixtures.rodada([],times),presencas:[]}).destino,'presencas');
});
test('check-in é aditivo, idempotente e rejeita IDs de outro contexto',()=>{
  const jogadores=fixtures.jogadores(times);
  const r={...fixtures.rodada([],[]),presencas:[jogadores[1].id]};
  const dados={versao:5,jogadores,rodadas:[r]};
  const novo=checkInCentral(dados,r.id,jogadores[0].id);
  assert.deepEqual(novo.rodadas[0].presencas,[jogadores[1].id,jogadores[0].id]);
  assert.deepEqual(checkInCentral(novo,r.id,jogadores[0].id),novo);
  assert.throws(()=>checkInCentral(dados,r.id,'desconhecido'),/não encontrado/);
  assert.throws(()=>checkInCentral(dados,'outro',jogadores[0].id),/inexistente/);
  assert.deepEqual(dados.rodadas[0].presencas,[jogadores[1].id]);
});
test('retirada não desfaz a presença de quem já está escalado',()=>{
  const r=fixtures.rodada([],times);
  const dados={versao:5,jogadores:fixtures.jogadores(times),rodadas:[r]};
  assert.throws(()=>retirarChegada(dados,r.id,times[0].atletas[0]),/time ou jogo/);
});
test('fluxo integrado: chegadas, times, gols, encerramento, correção e rankings',()=>{
  const {load}=criarCarregador();
  const store=load('SSWStore');
  const cadastro=fixtures.jogadores(times);
  let dados={versao:5,jogadores:cadastro,rodadas:[{...fixtures.rodada([],[]),presencas:[]}]};
  for(const j of [...cadastro].reverse()) dados=checkInCentral(dados,'teste-sabado',j.id);
  const grupos=distribuirPorChegadaAteSete(dados.rodadas[0].presencas,2);
  const equipes=times.map((e,i)=>({...e,atletas:grupos[i]}));
  assert.equal(validarEquipes(equipes,dados.rodadas[0].presencas),null);
  const inicial={...jogoDasEquipes(1,'teste-jogo',...equipes),goleiroA:grupos[0][0],goleiroB:grupos[1][0]};
  let jogo=lancarGol(inicial,'A',grupos[0][1],1);
  jogo=lancarGol(jogo,'A',grupos[0][1],1);
  jogo=lancarGol(jogo,'B',grupos[1][1],1);
  dados={...dados,rodadas:[{...dados.rodadas[0],equipes,jogos:[jogo]}]};
  const antes=store.classificar(dados);
  assert.equal(antes.reduce((s,j)=>s+j.pontos,0),0);
  assert.equal(antes.reduce((s,j)=>s+j.gols,0),0);
  assert.ok(antes.every(j=>j.presencas===1));
  dados={...dados,rodadas:[{...dados.rodadas[0],jogos:[encerrarPartida(jogo)]}]};
  store.atualizarDados(()=>dados,'fixture: encerrar');
  let stats=store.classificar(store.obterDadosAtuais());
  assert.equal(stats.find(j=>j.id===grupos[0][1]).gols,2);
  assert.equal(stats.find(j=>j.id===grupos[0][1]).pontos,3);
  assert.equal(stats.find(j=>j.id===grupos[1][1]).pontos,0);
  assert.equal(stats.find(j=>j.id===grupos[0][0]).golsSofridos,1);
  assert.equal(stats.find(j=>j.id===grupos[1][0]).golsSofridos,2);
  const reaberta=reabrirPartidaDaRodada(dados.rodadas[0],jogo.id);
  dados={...dados,rodadas:[reaberta]};
  assert.equal(store.classificar(dados).reduce((s,j)=>s+j.pontos,0),0);
  const corrigido=lancarGol(reaberta.jogos[0],'B',grupos[1][1],1);
  dados={...dados,rodadas:[{...reaberta,jogos:[encerrarPartida(corrigido)]}]};
  store.atualizarDados(()=>dados,'fixture: corrigir');
  stats=store.classificar(store.obterDadosAtuais());
  assert.ok(stats.every(j=>j.pontos===1 && j.empates===1 && j.jogos===1));
  assert.equal(stats.reduce((s,j)=>s+j.gols,0),4);
  store.desfazerAcao();
  assert.equal(store.obterDadosAtuais().rodadas[0].jogos[0].golsB,1);
  store.refazerAcao();
  assert.equal(store.obterDadosAtuais().rodadas[0].jogos[0].golsB,2);
  assert.equal(inicial.golsA,0);
});
test('reabrir uma súmula antiga não altera nem exige migração das demais',()=>{
  const antigo={...jogoDasEquipes(1,'antigo',...times),atletasA:[],atletasB:[],golsA:4,golsB:3,status:'encerrada',vinculoFormacao:false,equipeIdA:null,equipeIdB:null};
  const outro={...antigo,id:'outro',numero:2};
  const r=fixtures.rodada([antigo,outro],times);
  const novo=reabrirPartidaDaRodada(r,'antigo');
  assert.equal(novo.jogos[0].golsA,4);assert.equal(novo.jogos[0].status,'rascunho');
  assert.strictEqual(novo.jogos[1],outro);assert.equal(antigo.status,'encerrada');
  assert.throws(()=>encerrarPartida(novo.jogos[0]),/7 jogadores/);
});
test('lixeira e restauração conservam os gols de rascunho sem gerar pontos',()=>{
  const {classificar}=criarCarregador().load('SSWStore');
  const jogo=lancarGol(jogoDasEquipes(1,'teste-jogo',...times),'A',times[0].atletas[0],1);
  const original={versao:5,jogadores:fixtures.jogadores(times),rodadas:[fixtures.rodada([jogo],times)]};
  const lixo=excluirRascunhosParaLixeira(original,'teste-sabado',[jogo.id],()=> 'teste-lixeira','2026-10-27T17:00:00Z');
  assert.equal(lixo.rodadas[0].jogos.length,0);
  const restaurado=restaurarDaLixeira(lixo,'teste-lixeira');
  assert.deepEqual(restaurado.rodadas[0].jogos[0],jogo);
  assert.equal(classificar(restaurado).reduce((s,j)=>s+j.pontos,0),0);
  assert.equal(original.rodadas[0].jogos.length,1);
});
