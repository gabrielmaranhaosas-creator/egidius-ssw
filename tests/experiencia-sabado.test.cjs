const test=require('node:test');
const assert=require('node:assert/strict');
const {criarCarregador}=require('./carregar-regras.cjs');
const fixtures=require('./fixtures-sabado.cjs');
const equipes=fixtures.equipes();
const presentes=fixtures.jogadores().map(j=>j.id);
function iniciar(storage) {
  const env=criarCarregador(undefined,storage);
  const drafts=env.load('MontagemDrafts');drafts.definirOperadorMontagem('qa');
  return {...env,drafts};
}
const draft=()=>({equipes:structuredClone(equipes),origem:'[]',editado:true});

test('montagem sobrevive a uma nova sessão do aplicativo sem alterar a formação oficial',()=>{
  const e=iniciar();const original=e.storage.get('egidius.v05.clube');
  assert.equal(e.drafts.guardarMontagem('sabado-a',draft()),'');
  const recarregado=iniciar(e.storage);
  assert.deepEqual(recarregado.drafts.lerMontagem('sabado-a'),draft());
  assert.equal(recarregado.drafts.primeiraMontagemPendente(),'sabado-a');
  assert.equal(e.storage.get('egidius.v05.clube'),original);
});
test('rascunhos ficam separados por sábado e por operador',()=>{
  const e=iniciar();e.drafts.guardarMontagem('sabado-a',draft());
  const outro=draft();outro.equipes[0].nome='Ajuste separado';e.drafts.guardarMontagem('sabado-b',outro);
  assert.equal(e.drafts.lerMontagem('sabado-a').equipes[0].nome,equipes[0].nome);
  assert.equal(e.drafts.lerMontagem('sabado-b').equipes[0].nome,'Ajuste separado');
  e.drafts.definirOperadorMontagem('outro');assert.equal(e.drafts.lerMontagem('sabado-a'),null);
  e.drafts.definirOperadorMontagem('qa');assert.deepEqual(e.drafts.lerMontagem('sabado-a'),draft());
});
test('armazenamento cheio mantém o rascunho em memória e informa falha',()=>{
  const e=iniciar();e.storage.set=()=>{throw new Error('QuotaExceededError');};
  assert.match(e.drafts.guardarMontagem('a',draft()),/Mantenha esta aba aberta/);
  assert.deepEqual(e.drafts.lerMontagem('a'),draft());
});
test('edição de outra aba não é sobrescrita nem apagada pelo rascunho antigo',()=>{
  const e=iniciar();e.drafts.guardarMontagem('a',draft());
  const alterado=draft();alterado.equipes[0].nome='Outra aba';
  const key='egidius.montagem.v1:qa:a';const texto=JSON.stringify(alterado);e.storage.set(key,texto);
  const local=draft();local.equipes[0].nome='Minha aba';
  assert.match(e.drafts.guardarMontagem('a',local),/Outra aba/);
  assert.equal(e.storage.get(key),texto);
  e.drafts.limparMontagem('a');assert.equal(e.storage.get(key),texto);
});
test('confirmar remove somente o rascunho correspondente e mantém os demais',()=>{
  const e=iniciar();e.drafts.guardarMontagem('a',draft());e.drafts.guardarMontagem('b',draft());
  assert.equal(e.drafts.limparMontagem('a'),'');
  assert.equal(e.drafts.lerMontagem('a'),null);assert.deepEqual(e.drafts.lerMontagem('b'),draft());
});
test('rascunho corrompido não é aplicado e cópias lidas não alteram o original',()=>{
  const e=iniciar();e.storage.set('egidius.montagem.v1:qa:corrompido','{quebrado');
  assert.equal(e.drafts.lerMontagem('corrompido'),null);
  e.drafts.guardarMontagem('a',draft());const copia=e.drafts.lerMontagem('a');copia.equipes[0].atletas.pop();
  assert.equal(e.drafts.lerMontagem('a').equipes[0].atletas.length,7);
});
test('sábado selecionado prevalece sobre o mais recente e persiste após recarga',()=>{
  const e=iniciar();const rounds=[{...fixtures.rodada(),id:'antigo',data:'2026-11-14'},{...fixtures.rodada(),id:'novo',data:'2026-11-28'}];
  const active=e.load('ActiveRound');active.guardarSabadoAtivo('antigo');
  const next=criarCarregador(undefined,e.storage).load('ActiveRound');
  assert.equal(next.escolherSabadoAtivo(rounds,next.lerSabadoAtivo()),'antigo');
  assert.equal(next.escolherSabadoAtivo(rounds,'removido'),'novo');
  assert.equal(next.escolherSabadoAtivo([],'removido'),'');
});
test('troca entre times cheios é atômica e preserva o terceiro time e as capacidades',()=>{
  const {load}=iniciar();const {trocarJogadores}=load('TeamBoardRules');
  const antes=JSON.stringify(equipes);const a=equipes[0].atletas[0],b=equipes[1].atletas[0];
  const novas=trocarJogadores(equipes,presentes,a,b);
  assert.equal(novas[0].atletas[0],b);assert.equal(novas[1].atletas[0],a);
  assert.deepEqual(novas[2],equipes[2]);assert.deepEqual(novas.map(t=>t.atletas.length),[7,7,7]);
  assert.equal(new Set(novas.flatMap(e=>e.atletas)).size,21);assert.equal(JSON.stringify(equipes),antes);
  assert.deepEqual(trocarJogadores(novas,presentes,a,b),equipes);
});
test('troca inválida não modifica nenhum time nem aceita jogador ausente',()=>{
  const {load}=iniciar();const {trocarJogadores}=load('TeamBoardRules');const a=equipes[0].atletas[0],b=equipes[1].atletas[0];
  const antes=JSON.stringify(equipes);
  assert.throws(()=>trocarJogadores(equipes,presentes,a,a),/diferentes/);
  assert.throws(()=>trocarJogadores(equipes,presentes,a,equipes[0].atletas[1]),/times diferentes/);
  assert.throws(()=>trocarJogadores(equipes,presentes.filter(id=>id!==b),a,b),/presença/);
  assert.equal(JSON.stringify(equipes),antes);
});
