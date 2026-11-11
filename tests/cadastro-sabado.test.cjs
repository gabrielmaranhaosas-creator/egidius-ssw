const test=require('node:test');
const assert=require('node:assert/strict');
const {load,criarCarregador}=require('./carregar-regras.cjs');
const {cadastrarJogador,normalizarNomeCadastro}=load('CadastroRules');
const {statusRodada,jogadoresPorChegada}=load('CampoRules');
const vazio=()=>({versao:5,jogadores:[],rodadas:[
  {id:'teste-anterior',data:'2026-10-24',presencas:[],equipes:[],jogos:[]},
  {id:'teste-selecionado',data:'2026-10-31',presencas:[],equipes:[],jogos:[]},
]});

test('nome mantém acentos e normaliza espaços e Unicode',()=>{
  assert.equal(normalizarNomeCadastro('  Jose\u0301   da\nSilva  '),'José da Silva');
});
for(const nome of ['', 'A', 'A'.repeat(71)]) {
  test('cadastro rejeita nome com comprimento inválido: '+nome.length,()=>{
    const d=vazio(), before=JSON.stringify(d);
    assert.throws(()=>cadastrarJogador(d,nome,'teste-j'),/2 e 70/);
    assert.equal(JSON.stringify(d),before);
  });
}
for(const nome of [' JOSÉ DA SILVA ', 'José   da Silva', 'Jose\u0301 da Silva']) {
  test('duplicidade é reconhecida sem depender da apresentação: '+nome,()=>{
    const d=cadastrarJogador(vazio(),'José da Silva','teste-1');
    assert.throws(()=>cadastrarJogador(d,nome,'teste-2'),/já está cadastrado/);
    assert.equal(d.jogadores.length,1);
  });
}
test('nomes com e sem acento não são fundidos automaticamente',()=>{
  const d=cadastrarJogador(cadastrarJogador(vazio(),'José','teste-1'),'Jose','teste-2');
  assert.equal(d.jogadores.length,2);
});
test('identificador vazio ou existente é recusado',()=>{
  const d=cadastrarJogador(vazio(),'Nome de teste','teste-1');
  assert.throws(()=>cadastrarJogador(d,'Outro nome','teste-1'),/identificador único/);
  assert.throws(()=>cadastrarJogador(d,'Outro nome',' '),/identificador único/);
});
test('cadastro simples não marca chegadas nem cria sábado',()=>{
  const d=vazio();
  const novo=cadastrarJogador(d,'Jogador de teste','teste-1');
  assert.strictEqual(novo.rodadas,d.rodadas);
  assert.deepEqual(novo.rodadas.map(r=>r.presencas),[[],[]]);
  assert.equal(cadastrarJogador({...d,rodadas:[]},'Jogador de teste','teste-1').rodadas.length,0);
  assert.equal(d.jogadores.length,0);
});
test('cadastro com chegada afeta apenas a data escolhida, ao fim da fila',()=>{
  const d=cadastrarJogador(vazio(),'Primeiro de teste','teste-1','teste-selecionado');
  const novo=cadastrarJogador(d,'Segundo de teste','teste-2','teste-selecionado');
  assert.deepEqual(novo.rodadas[1].presencas,['teste-1','teste-2']);
  assert.strictEqual(novo.rodadas[0],d.rodadas[0]);
  assert.deepEqual(d.rodadas[1].presencas,['teste-1']);
});
test('sábado removido recusa a operação inteira, sem cadastro parcial',()=>{
  const d=vazio(), before=JSON.stringify(d);
  assert.throws(()=>cadastrarJogador(d,'Nome de teste','teste-1','removido'),/não existe mais/);
  assert.equal(JSON.stringify(d),before);
});
test('uma única ação desfaz e refaz cadastro e presença em conjunto',()=>{
  const {load}=criarCarregador(vazio());
  const s=load('SSWStore');
  s.atualizarDados(d=>cadastrarJogador(d,'Nome de teste','teste-1','teste-selecionado'),'cadastro e chegada de teste');
  assert.equal(s.obterDadosAtuais().jogadores.length,1);
  assert.deepEqual(s.obterDadosAtuais().rodadas[1].presencas,['teste-1']);
  s.desfazerAcao();
  assert.equal(s.obterDadosAtuais().jogadores.length,0);
  assert.deepEqual(s.obterDadosAtuais().rodadas[1].presencas,[]);
  s.refazerAcao();
  assert.equal(s.obterDadosAtuais().jogadores.length,1);
  assert.deepEqual(s.obterDadosAtuais().rodadas[1].presencas,['teste-1']);
});
test('Sábado completo encaminha cadastro vazio antes das chegadas',()=>{
  const d=vazio();
  assert.equal(statusRodada(d.rodadas[1],d.jogadores).destino,'cadastro');
  const novo=cadastrarJogador(d,'Nome de teste','teste-1');
  assert.equal(statusRodada(novo.rodadas[1],novo.jogadores).destino,'presencas');
  assert.equal(statusRodada(undefined,[]).destino,'rodadas');
});
test('lista dos times acompanha chegadas, sem reordenar o cadastro',()=>{
  const jogadores=[{id:'a',nome:'Primeiro cadastrado'},{id:'b',nome:'Segundo cadastrado'}];
  const r={...vazio().rodadas[1],presencas:['b','desconhecido','a','b']};
  assert.deepEqual(jogadoresPorChegada(r,jogadores).map(j=>j.id),['b','a']);
  assert.deepEqual(jogadores.map(j=>j.id),['a','b']);
  assert.deepEqual(r.presencas,['b','desconhecido','a','b']);
});
test('time com atleta ausente do cadastro não aparece como completo',()=>{
  const ids=Array.from({length:14},(_,i)=>'teste-'+i);
  const r={...vazio().rodadas[1],presencas:ids,equipes:[
    {id:'a',nome:'Branco',atletas:ids.slice(0,7)},
    {id:'b',nome:'Colorido',atletas:ids.slice(7)},
  ]};
  const jogadores=ids.slice(1).map(id=>({id,nome:id}));
  assert.equal(statusRodada(r,jogadores).timesCompletos,1);
  assert.equal(statusRodada(r,jogadores).confrontoPronto,false);
});
