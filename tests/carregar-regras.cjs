// Executa o TypeScript real do projeto com APIs de navegador isoladas em memória.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const ts = require('typescript');
const src = path.resolve(__dirname, '../src');

function criarCarregador(inicial = { versao: 5, jogadores: [], rodadas: [] }) {
  const cache = new Map();
  const storage = new Map([['egidius.v05.clube', JSON.stringify(inicial)]]);
  const listeners = new Map();
  const window = {
    localStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: key => storage.delete(key),
    },
    addEventListener: (name, fn) => listeners.set(name, [...(listeners.get(name) ?? []), fn]),
    dispatchEvent: event => { for (const fn of listeners.get(event.type) ?? []) fn(event); return true; },
  };
  function load(name) {
    if (cache.has(name)) return cache.get(name).exports;
    if (!/^[A-Za-z][A-Za-z0-9]*$/.test(name)) throw Error('Módulo de teste inválido');
    const file = path.join(src, name + '.ts');
    const result = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      fileName: file, reportDiagnostics: true,
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    });
    const errors = (result.diagnostics ?? []).filter(d => d.category === ts.DiagnosticCategory.Error);
    if (errors.length) throw Error(ts.flattenDiagnosticMessageText(errors[0].messageText, '\n'));
    const module = { exports: {} };
    cache.set(name, module);
    const executar = vm.runInThisContext(
      '(function(require,module,exports,window,crypto,Event){' + result.outputText + '\n})', { filename: file });
    executar(spec => {
      if (spec === 'react') return require('react');
      if (spec.startsWith('./')) return load(spec.slice(2));
      throw Error('Dependência de teste não permitida: ' + spec);
    }, module, module.exports, window, webcrypto, Event);
    return module.exports;
  }
  return { load, storage };
}
module.exports = { criarCarregador, load: criarCarregador().load };
