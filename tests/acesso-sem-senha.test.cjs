const test = require('node:test');
const assert = require('node:assert/strict');
const {load} = require('./carregar-regras.cjs');
const {criarAcessoSemSenha} = load('Acesso');
const auth = {authenticated: true, username: 'operador_local', csrf: 'csrf-teste'};

test('abre localmente sem pedir credenciais', async () => {
  const calls = [];
  const entrar = criarAcessoSemSenha(async (path, options) => {
    calls.push([path, options]);
    return path === '/auth/status' ? {authenticated: false} : auth;
  }, () => new URL('http://127.0.0.1:5173/'), () => assert.fail());
  assert.equal(await entrar(), auth);
  assert.deepEqual(calls.map(c => c[0]), ['/auth/status', '/auth/local']);
  assert.equal(calls[1][1].method, 'POST');
});

test('preserva uma sessão existente', async () => {
  const calls = [];
  const entrar = criarAcessoSemSenha(async path => {calls.push(path); return auth;},
    () => new URL('http://localhost:5173/'), () => assert.fail());
  assert.equal(await entrar(), auth);
  assert.deepEqual(calls, ['/auth/status']);
});

test('convite só sai do endereço após aceitação e chamadas simultâneas compartilham a entrada', async () => {
  let resolve, calls = 0, limpo = false;
  const entrar = criarAcessoSemSenha(async (path, options) => {
    calls++;
    assert.equal(path, '/auth/invite');
    assert.equal(JSON.parse(options.body).token, 'convite-teste');
    return new Promise(r => {resolve = r;});
  }, () => new URL('https://exemplo.test/#convite=convite-teste'), () => {limpo = true;});
  const a = entrar(), b = entrar();
  assert.strictEqual(a, b);
  assert.equal(limpo, false);
  resolve(auth);
  assert.equal(await a, auth);
  assert.equal(limpo, true);
  assert.equal(calls, 1);
});

test('convite com falha permite nova tentativa sem apagar o endereço', async () => {
  let calls = 0, limpo = false;
  const entrar = criarAcessoSemSenha(async () => {if (++calls === 1) throw Error('offline'); return auth;},
    () => new URL('https://exemplo.test/#convite=abc'), () => {limpo = true;});
  await assert.rejects(entrar(), /offline/);
  assert.equal(limpo, false);
  assert.equal(await entrar(), auth);
  assert.equal(limpo, true);
});

test('endereço externo sem sessão solicita convite e nunca tenta entrada local', async () => {
  for (const url of ['https://exemplo.test/', 'http://127.0.0.1:8080/', 'http://192.168.1.2:5173/']) {
    const calls = [];
    const entrar = criarAcessoSemSenha(async path => {calls.push(path); return {authenticated: false};},
      () => new URL(url), () => assert.fail());
    await assert.rejects(entrar(), /convite/);
    assert.deepEqual(calls, ['/auth/status']);
  }
});

test('resposta incompleta não abre a aplicação', async () => {
  const entrar = criarAcessoSemSenha(async () => ({authenticated: true}),
    () => new URL('http://localhost:5173/'), () => assert.fail());
  await assert.rejects(entrar(), /acesso local/);
});
