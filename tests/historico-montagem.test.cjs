const test=require('node:test'),assert=require('node:assert/strict');
const {criarCarregador}=require('./carregar-regras.cjs');const f=require('./fixtures-sabado.cjs');
function iniciar(){const {load}=criarCarregador();return {...load('HistoricoMontagem'),rules:load('TeamBoardRules'),load};}
test('desfazer e refazer percorrem renomeação, criação de time e escolha manual sem tocar em jogos',()=>{
 const r=iniciar();let equipes=f.equipes().slice(0,2),h=r.historicoMontagemVazio();const original=structuredClone(equipes);
 const jogo=r.load('RoundRules').jogoDasEquipes(1,'historico',...equipes);jogo.status='encerrada';jogo.golsA=2;const antes=JSON.stringify(jogo);
 const estados=[structuredClone(equipes)];
 for(const proxima of [equipes.map((e,i)=>i?e:{...e,nome:'Amigos'}),[...equipes.map((e,i)=>i?e:{...e,nome:'Amigos'}),{id:'extra',nome:'Time 3',atletas:[]}]]){h=r.registrarMontagem(h,equipes,proxima);equipes=proxima;estados.push(structuredClone(equipes));}
 const proxima=r.rules.atribuirJogador(equipes,f.jogadores().map(j=>j.id),f.equipes()[2].atletas[0],'extra');h=r.registrarMontagem(h,equipes,proxima);equipes=proxima;estados.push(structuredClone(equipes));
 for(let i=2;i>=0;i--){const x=r.moverHistoricoMontagem(h,equipes);assert.deepEqual(x.equipes,estados[i]);h=x.historico;equipes=x.equipes;}
 assert.deepEqual(equipes,original);assert.equal(r.moverHistoricoMontagem(h,equipes),null);
 for(let i=1;i<=3;i++){const x=r.moverHistoricoMontagem(h,equipes,true);assert.deepEqual(x.equipes,estados[i]);h=x.historico;equipes=x.equipes;}
 assert.equal(JSON.stringify(jogo),antes);
});
test('digitação no mesmo nome vira uma ação; ao sair do campo outra edição fica separada',()=>{
 const r=iniciar(),base=f.equipes();let h=r.historicoMontagemVazio(),atual=base;
 for(const nome of ['A','Am','Amigos']){const nova=atual.map((e,i)=>i?e:{...e,nome});h=r.registrarMontagem(h,atual,nova,'nome:0');atual=nova;}
 assert.equal(h.anteriores.length,1);assert.deepEqual(r.moverHistoricoMontagem(h,atual).equipes,base);
 h={...h,grupo:undefined};const outra=atual.map((e,i)=>i?e:{...e,nome:'Amigos de sábado'});h=r.registrarMontagem(h,atual,outra,'nome:0');assert.equal(h.anteriores.length,2);
});
test('nova alteração após desfazer invalida somente o caminho de refazer',()=>{
 const r=iniciar(),base=f.equipes(),nova=base.slice(0,2);let h=r.registrarMontagem(r.historicoMontagemVazio(),base,nova);const x=r.moverHistoricoMontagem(h,nova);h=x.historico;
 assert.equal(h.posteriores.length,1);assert.equal(r.registrarMontagem(h,base,base),h);
 h=r.registrarMontagem(h,base,base.map((e,i)=>i?e:{...e,nome:'Outro nome'}));assert.equal(h.posteriores.length,0);assert.equal(h.anteriores.length,1);
});
test('histórico guarda até vinte ações e isola cópias de jogadores',()=>{
 const r=iniciar();let atual=f.equipes(),h=r.historicoMontagemVazio();for(let i=0;i<25;i++){const nova=atual.map((e,n)=>n?e:{...e,nome:'Time '+i});h=r.registrarMontagem(h,atual,nova);atual=nova;}
 assert.equal(h.anteriores.length,20);const x=r.moverHistoricoMontagem(h,atual);x.equipes[0].atletas.pop();assert.equal(h.anteriores.at(-1)[0].atletas.length,7);assert.equal(atual[0].atletas.length,7);
});
test('limpeza e restauração da formação mantêm a ordem exata dos jogadores',()=>{
 const r=iniciar(),base=f.equipes(),vazia=base.map(e=>({...e,atletas:[]}));const h=r.registrarMontagem(r.historicoMontagemVazio(),base,vazia),undo=r.moverHistoricoMontagem(h,vazia);assert.deepEqual(undo.equipes,base);assert.deepEqual(r.moverHistoricoMontagem(undo.historico,undo.equipes,true).equipes,vazia);
});

test('digitar e devolver o mesmo nome não deixa uma ação vazia no histórico',()=>{
 const r=iniciar(),base=f.equipes(),temporaria=base.map((e,i)=>i?e:{...e,nome:'Nome temporário'});
 let h=r.registrarMontagem(r.historicoMontagemVazio(),base,temporaria,'nome:0');
 h=r.registrarMontagem(h,temporaria,base,'nome:0');assert.equal(h.anteriores.length,0);assert.equal(r.moverHistoricoMontagem(h,base),null);
 const nova=base.map((e,i)=>i?e:{...e,nome:'Nova edição'});h=r.registrarMontagem(h,base,nova,'nome:0');assert.deepEqual(r.moverHistoricoMontagem(h,nova).equipes,base);
});
