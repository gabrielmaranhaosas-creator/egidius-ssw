const test=require('node:test'),assert=require('node:assert/strict');
const {criarCarregador}=require('./carregar-regras.cjs');
const f=require('./fixtures-sabado.cjs');
const copy=x=>structuredClone(x);
function base(){const load=criarCarregador().load;return {load,d:{versao:5,jogadores:f.jogadores(),rodadas:[f.rodada([load('RoundRules').jogoDasEquipes(1,'j1',...f.equipes().slice(0,2))],f.equipes())]}};}
test('chegada tardia, troca e retirada de equipe preservam o snapshot e rankings anteriores',()=>{
 const {load,d}=base();const r=d.rodadas[0],g=r.jogos[0];g.status='encerrada';g.golsA=1;g.golsPorAtleta[g.atletasA[0]]=1;
 const antes=JSON.stringify(g),stats=load('SSWStore').classificar(d);
 const {trocarJogadores,salvarMontagem,assinaturaEquipes}=load('TeamBoardRules');
 const times=trocarJogadores(r.equipes,r.presencas,r.equipes[0].atletas[0],r.equipes[1].atletas[0]);
 const novo=salvarMontagem(d,r.id,assinaturaEquipes(r.equipes),times);
 assert.equal(JSON.stringify(novo.rodadas[0].jogos[0]),antes);assert.deepEqual(load('SSWStore').classificar(novo),stats);
 const proximo=load('RoundRules').jogoDasEquipes(2,'j2',...novo.rodadas[0].equipes.slice(0,2));assert.notDeepEqual(proximo.atletasA,g.atletasA);
});
test('edições de partidas diferentes são mescladas; a mesma partida exige revisão',()=>{
 const {load,d}=base();d.rodadas[0].jogos.push({...copy(d.rodadas[0].jogos[0]),id:'j2',numero:2});
 const local=copy(d),remote=copy(d);local.rodadas[0].jogos[0].golsA=1;remote.rodadas[0].jogos[1].golsB=2;
 const merge=load('MesclarEstados').mesclarEstados;
 const resultado=merge(d,local,remote);assert.equal(resultado.conflitos.length,0);assert.equal(resultado.data.rodadas[0].jogos[0].golsA,1);assert.equal(resultado.data.rodadas[0].jogos[1].golsB,2);
 remote.rodadas[0].jogos[0].golsB=1;const conflito=merge(d,local,remote);assert.equal(conflito.data,null);assert.match(conflito.conflitos[0],/jogos\[j1\]/);
});
test('exclusão versus edição não perde o registro silenciosamente',()=>{
 const {load,d}=base(),l=copy(d),r=copy(d);l.rodadas[0].jogos=[];r.rodadas[0].jogos[0].observacoes='outra sessão';assert.equal(load('MesclarEstados').mesclarEstados(d,l,r).data,null);
});
test('busca manual normaliza acentos, espaços e letras sem alterar o nome',()=>{const {load}=base();assert.equal(load('Busca').normalizarBusca('  FICTÍCIO  '),'ficticio');});
test('saída de edição pede decisão e envio em andamento bloqueia abandono',()=>{
 const {load,window}=criarCarregador();
 let confirmou=0;window.confirm=()=>{confirmou++;return false;};window.alert=()=>{};
 const pending=load('TrabalhoPendente');
 const cleanup=pending.registrarPendencia('teste','Ficha pendente');
 assert.equal(pending.podeAbandonarEdicao(),false);assert.equal(confirmou,1);
 window.confirm=()=>true;assert.equal(pending.podeAbandonarEdicao(),true);cleanup();assert.equal(pending.podeAbandonarEdicao(),true);
 const end=pending.registrarPendencia('envio','Enviando',true);assert.equal(pending.podeAbandonarEdicao(),false);end();
});
test('saída libera somente a montagem futura; retorno preserva presença e não escala automaticamente',()=>{
 const {load,d}=base();const r=d.rodadas[0],p=r.presencas[0],game=JSON.stringify(r.jogos);
 const saida=load('Disponibilidade').definirDisponibilidade(d,r.id,p,false);
 assert.ok(saida.rodadas[0].presencas.includes(p));assert.ok(saida.rodadas[0].indisponiveis.includes(p));assert.ok(!saida.rodadas[0].equipes.some(e=>e.atletas.includes(p)));assert.equal(JSON.stringify(saida.rodadas[0].jogos),game);
 assert.ok(!load('CampoRules').jogadoresPorChegada(saida.rodadas[0],saida.jogadores).some(j=>j.id===p));
 const voltou=load('Disponibilidade').definirDisponibilidade(saida,r.id,p,true);assert.equal(voltou.rodadas[0].indisponiveis.length,0);assert.ok(!voltou.rodadas[0].equipes.some(e=>e.atletas.includes(p)));
});
test('revisão escolhe apenas o jogo divergente e mantém alterações independentes',()=>{
 const {load,d}=base(),l=copy(d),r=copy(d);l.rodadas[0].jogos[0].golsA=2;r.rodadas[0].jogos[0].golsB=1;r.jogadores.push({id:'novo',nome:'Nome novo'});
 const rules=load('MesclarEstados'),mescla=rules.mesclarEstados(d,l,r);
 assert.throws(()=>rules.aplicarEscolhas(mescla,{}),/Escolha/);
 const local=rules.aplicarEscolhas(mescla,{0:'local'});assert.equal(local.rodadas[0].jogos[0].golsA,2);assert.equal(local.rodadas[0].jogos[0].golsB,0);assert.ok(local.jogadores.some(j=>j.id==='novo'));
 const remote=rules.aplicarEscolhas(mescla,{0:'remoto'});assert.equal(remote.rodadas[0].jogos[0].golsB,1);
});
