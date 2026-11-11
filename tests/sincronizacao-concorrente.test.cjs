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
async function abrir() {
  const states=[], refs=[], effects=[], events=new Map();
  let cursor=0, effectQueue=[], local={versao:5,jogadores:[],rodadas:[]};
  let observer, poll, component;
  const remote={revision:1,data:{versao:5,jogadores:[{id:'j1',nome:'Primeiro teste'}],rodadas:[]}};
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
    if(name==='react')return React;
    if(name==='react/jsx-runtime')return {jsx,jsxs:jsx,Fragment:'fragment'};
    if(name==='lucide-react')return new Proxy({}, {get:()=>()=>null});
    if(name==='./SSWStore')return {obterDadosAtuais:()=>copy(local),
      adotarDadosDoServidor:data=>{local=copy(data);},
      observarMudancas:fn=>{observer=fn;return ()=>{observer=null;};},exportarBackup(){}};
    if(name==='./Acesso')return {criarAcessoSemSenha:()=>async()=>({authenticated:true,username:'operador_local',csrf:'teste'})};
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
    return {ok:true,json:async()=>payload};
  },URL);
  function render(){cursor=0;component=module.exports.SyncGate({children:null});
    const next=effectQueue;effectQueue=[];for(const fn of next)fn();return component;}
  render();await flush();render();
  assert.equal(states[0],'ready');
  return {states,render,remote,setResponder:fn=>{responder=fn;},
    visibility(value){window.document.visibilityState=value;events.get('visibilitychange')?.();},
    poll:()=>poll(),edit(data){local=copy(data);observer();},current:()=>copy(local)};
}

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
  assert.equal(app.states[1],'saved');
});

test('resposta remota durante uma gravação não elimina alterações locais',async()=>{
  const app=await abrir(), read=pending(), write=pending();
  app.setResponder(async(_url,options)=>options?.method==='PUT'?write.promise:read.promise);
  app.poll();
  const changed={...app.current(),jogadores:[...app.current().jogadores,{id:'j2',nome:'Segundo teste'}]};
  app.edit(changed);
  read.resolve({revision:3,data:app.remote.data});await flush();
  assert.deepEqual(app.current(),changed);
  assert.equal(app.states[1],'sending');
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
  assert.equal(app.states[1],'offline');
  const button=findButton(app.render(),'Tentar novamente');
  assert.ok(button);
  button.props.onClick();await flush();
  assert.equal(app.states[1],'offline');
  assert.equal(requests,2);
  app.setResponder(async()=>copy(app.remote));
  button.props.onClick();await flush();
  assert.equal(app.states[1],'saved');
});
