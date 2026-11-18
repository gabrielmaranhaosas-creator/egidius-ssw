const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const flush = () => new Promise(resolve => setImmediate(resolve));
const copy = value => JSON.parse(JSON.stringify(value));
const pending = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return {promise, resolve}; };

// Executa o componente verdadeiro com hooks, rede e armazenamento controlados.
async function abrir({publico=false,initialData,initialGeneration=0,remoteGeneration=0}={}) {
  const states=[], refs=[], effects=[], events=new Map();
  let cursor=0, effectQueue=[], local={versao:5,jogadores:[],rodadas:[]};
  if(initialData)local=copy(initialData);
  const geracao=require('./carregar-regras.cjs').criarCarregador().load('GeracaoDados');geracao.guardarGeracao(initialGeneration);
  let observer, poll, component;
  const remote={revision:1,generation:remoteGeneration,data:{versao:5,jogadores:[{id:'j1',nome:'Primeiro teste'}],rodadas:[]}};
  let responder=async (_url, options) => options?.method==='PUT' ? {revision:2} : copy(remote);
  const React={
    useState(initial) { const id=cursor++; if (!(id in states)) states[id]=initial;
      return [states[id],value=>{states[id]=typeof value==='function'?value(states[id]):value;}]; },
    useRef(initial) { const id=cursor++; return refs[id] ||= {current:initial}; },
    useEffect(fn,deps) { const id=cursor++; const before=effects[id];
      if (!before || deps.some((value,i)=>value!==before.deps[i])) {
        effectQueue.push(()=>{before?.cleanup?.();effects[id]={deps,cleanup:fn()};});
      }
    },
  };
  const jsx=(_type,props)=>({type:_type,props});
  const window={location:{href:'http://127.0.0.1:5173/'},history:{replaceState(){}},
    document:{visibilityState:'visible',addEventListener(name,fn){events.set(name,fn);},removeEventListener(name){events.delete(name);}},
    setInterval(fn){poll=fn;return 1;},clearInterval(){},setTimeout(){return 1;},
    addEventListener(name,fn){events.set(name,fn);},removeEventListener(name){events.delete(name);}};
  const requireMock=name=>{
    if(name==='./GeracaoDados')return geracao;
    if(name==='react')return React;
    if(name==='react/jsx-runtime')return {jsx,jsxs:jsx,Fragment:'fragment'};
    if(name==='lucide-react')return new Proxy({}, {get:()=>()=>null});
    if(name==='./SSWStore')return {definirGravacaoPermitida(){},obterDadosAtuais:()=>copy(local),
      adotarDadosDoServidor:data=>{local=copy(data);},
      observarMudancas:fn=>{observer=fn;return ()=>{observer=null;};},exportarBackup(){}};
    if(name==='./Acesso')return {criarAcessoSemSenha:()=>async()=>{if(publico)throw Object.assign(Error('Consulta pública'),{code:'PUBLIC_ACCESS'});return {authenticated:true,username:'operador_local',csrf:'teste'};}};
    if(name==='./TrabalhoPendente')return {useResumoPendencias:()=>'',podeAbandonarEdicao:()=>true};
    if(name==='./Permissoes')return {usePapel:()=> 'admin',definirPapel(){}};
    if(name==='./RevisarConflitos')return {};
    if(name==='./FutebolPublico')return {FutebolPublico:()=>null};
    if(name==='./Organizacao')return {};
    if(name==='./MesclarEstados')return require('./carregar-regras.cjs').load('MesclarEstados');
    if(name==='./MontagemDrafts')return {definirOperadorMontagem(){},podeSairDaMontagem:()=>true,useMontagensPendentes:()=>0};
    if(name.endsWith('.css'))return {};
    throw Error('Dependência não esperada: '+name);
  };
  const file=path.resolve(__dirname,'../src/SyncGate.tsx');
  const result=ts.transpileModule(fs.readFileSync(file,'utf8'),{
    fileName:file,compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}});
  const module={exports:{}};
  const execute=vm.runInThisContext('(function(require,module,exports,window,fetch,URL){'+result.outputText+'\n})',{filename:file});
  execute(requireMock,module,module.exports,window,async(url,options)=>{
    const payload=await responder(url,options);
    return {ok:!payload.__httpCode,status:payload.__httpCode||200,json:async()=>payload};
  },URL);
  function render(){cursor=0;component=module.exports.SyncGate({children:null});
    const next=effectQueue;effectQueue=[];for(const fn of next)fn();return component;}
  render();await flush();render();
  assert.equal(states[3],publico?'public':'ready');
  return {states,render,remote,setResponder:fn=>{responder=fn;},
    visibility(value){window.document.visibilityState=value;events.get('visibilitychange')?.();},
    poll:()=>poll(),edit(data){local=copy(data);observer();},current:()=>copy(local)};
}

test('visitante sem sessão recebe consulta pública sem carregar ou gravar o estado privado',async()=>{
  const app=await abrir({publico:true});
  assert.equal(app.states[3],'public');
  assert.deepEqual(app.current(),{versao:5,jogadores:[],rodadas:[]});
  const page=app.render();assert.equal(typeof page.type,'function');assert.equal(typeof page.props.entrar,'function');
  page.props.entrar();app.render();assert.equal(app.states[1],true);
});

test('aba oculta suspende consultas e retoma a leitura ao voltar',async()=>{
  const app=await abrir();let calls=0;
  app.setResponder(async()=>{calls++;return copy(app.remote);});
  app.visibility('hidden');app.poll();await flush();
  assert.equal(calls,0);
  app.visibility('visible');await flush();
  assert.equal(calls,1);
});

test('leitura antiga não desfaz gravação concluída enquanto a resposta estava em trânsito',async()=>{
  const app=await abrir(), read=pending(), write=pending();
  app.setResponder(async(_url,options)=>options?.method==='PUT'?write.promise:read.promise);
  app.poll();
  const changed={...app.current(),jogadores:[...app.current().jogadores,{id:'j2',nome:'Segundo teste'}]};
  app.edit(changed);
  write.resolve({revision:2});await flush();
  read.resolve(copy(app.remote));await flush();
  assert.deepEqual(app.current(),changed);
  assert.equal(app.states[4],'saved');
});

test('resposta remota durante uma gravação não elimina alterações locais',async()=>{
  const app=await abrir(), read=pending(), write=pending();
  app.setResponder(async(_url,options)=>options?.method==='PUT'?write.promise:read.promise);
  app.poll();
  const changed={...app.current(),jogadores:[...app.current().jogadores,{id:'j2',nome:'Segundo teste'}]};
  app.edit(changed);
  read.resolve({revision:3,data:app.remote.data});await flush();
  assert.deepEqual(app.current(),changed);
  assert.equal(app.states[4],'sending');
  write.resolve({revision:2});await flush();
});

function findButton(node,label){
  if(!node || typeof node!=='object')return null;
  if(node.type==='button' && node.props.children===label)return node;
  const children=Array.isArray(node.props?.children)?node.props.children:[node.props?.children];
  for(const child of children){const found=findButton(child,label);if(found)return found;}
  return null;
}

test('tentar novamente confirma a conexão e não anuncia salvo quando a API continua offline',async()=>{
  const app=await abrir();let requests=0;
  app.setResponder(async()=>{requests++;throw Error('offline de teste');});
  app.poll();await flush();
  assert.equal(app.states[4],'offline');
  const button=findButton(app.render(),'Tentar novamente');
  assert.ok(button);
  button.props.onClick();await flush();
  assert.equal(app.states[4],'offline');
  assert.equal(requests,2);
  app.setResponder(async()=>copy(app.remote));
  button.props.onClick();await flush();
  assert.equal(app.states[4],'saved');
});


test('reinício no servidor invalida a cópia anterior do navegador antes de oferecer importação',async()=>{
 const antigo={versao:5,jogadores:[{id:'antigo',nome:'Teste removido'}],rodadas:[]};
 const app=await abrir({initialData:antigo,remoteGeneration:7});
 assert.deepEqual(app.current(),app.remote.data);assert.equal(app.states[3],'ready');
});
test('reinício recebido em segundo plano adota a base nova sem mesclar dados antigos',async()=>{
 const app=await abrir();app.remote.generation=8;app.remote.revision=9;app.remote.data={versao:5,jogadores:[],rodadas:[]};
 app.poll();await flush();assert.deepEqual(app.current(),app.remote.data);assert.equal(app.states[4],'saved');
});
test('409 após reinício não recoloca edições da geração antiga e o novo envio usa a geração atual',async()=>{
 const app=await abrir();const fresh={revision:10,generation:9,data:{versao:5,jogadores:[],rodadas:[]}};let puts=[];
 app.setResponder(async(_url,options)=>{if(options?.method==='PUT'){puts.push(JSON.parse(options.body));return {__httpCode:409,detail:'Base reiniciada'};}return copy(fresh);});
 app.edit({...app.current(),jogadores:[...app.current().jogadores,{id:'velho',nome:'Não voltar'}]});
 await flush();await flush();assert.deepEqual(app.current(),fresh.data);assert.equal(puts.length,1);assert.equal(puts[0].expected_generation,0);
 app.setResponder(async(_url,options)=>{if(options?.method==='PUT'){puts.push(JSON.parse(options.body));return {revision:11};}return copy(fresh);});
 app.edit({versao:5,jogadores:[{id:'novo',nome:'Novo teste'}],rodadas:[]});await flush();assert.equal(puts[1].expected_generation,9);assert.equal(app.current().jogadores[0].id,'novo');
});
