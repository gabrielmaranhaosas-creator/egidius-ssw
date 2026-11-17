const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
const file=path.resolve(__dirname,'../src/FutebolPublico.tsx');
const source=fs.readFileSync(file,'utf8');
const result=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}});
const mod={exports:{}};
vm.runInThisContext('(function(require,module,exports){'+result.outputText+'\n})',{filename:file})(name=>name.endsWith('.css')?{}:require(name),mod,mod.exports);
const {PainelFutebolPublico,ordenarRankingPublico}=mod.exports;
const stat=(id,nome,pontos,gols,jogosGoleiro=0,golsSofridos=0)=>({id,nome,pontos,gols,jogosGoleiro,golsSofridos,jogos:1,presencas:1,vitorias:1,empates:0,derrotas:0});
function render(dados=null,extra={}){return renderToStaticMarkup(React.createElement(PainelFutebolPublico,{dados,entrar(){},atualizar(){},...extra}));}
test('consulta vazia mostra navegação livre e entrada para organização sem pedir convite',()=>{
 const html=render();assert.match(html,/Consulta livre/);assert.match(html,/Entrar para organizar/);assert.match(html,/Nenhum sábado publicado/);assert.doesNotMatch(html,/Convite de acesso necessário/);
});
test('placares provisórios e histórico são renderizados sem interpretar nomes como HTML',()=>{
 const dados={jogadores:[{id:'p',nome:'<script>alert(1)</script>'}],rankings:[],rodadas:[{id:'r',data:'2026-11-14',presencas:['p'],equipes:[],jogos:[{id:'g',numero:1,timeA:'<img onerror=alert(1)>',timeB:'Branco',golsA:2,golsB:1,status:'rascunho',atletasA:['p'],atletasB:[],golsPorAtleta:{p:2},goleiroA:'p',goleiroB:null}]}]};
 const html=render(dados);assert.match(html,/provisório/);assert.match(html,/goleiro/);assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script>|<img onerror/);
});
test('ranking respeita critério desempate de pontos nome e gols sofridos e não muda a entrada',()=>{
 const stats=[stat('b','Beto',1,3,2,6),stat('a','Ana',3,1,2,2),stat('c','Caio',3,1,1,0)];const before=JSON.stringify(stats);
 assert.deepEqual(ordenarRankingPublico(stats,'pontos').map(p=>p.id),['a','c','b']);
 assert.deepEqual(ordenarRankingPublico(stats,'gols').map(p=>p.id),['b','a','c']);
 assert.deepEqual(ordenarRankingPublico(stats,'jogosGoleiro').map(p=>p.id),['a','b','c']);assert.equal(JSON.stringify(stats),before);
});
test('falha de atualização tem mensagem acessível e não se apresenta como dado atual',()=>{
 const html=render(null,{erro:'Falha ao atualizar',carregando:false});assert.match(html,/role="alert"/);assert.match(html,/Falha ao atualizar/);assert.doesNotMatch(html,/Atualizado às/);
});
