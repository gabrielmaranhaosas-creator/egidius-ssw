import { useSyncExternalStore } from 'react';

export type StatusJogo = 'rascunho' | 'encerrada';
export type Jogador = { id: string; nome: string };
export type EquipeRodada = { id: string; nome: string; atletas: string[] };
export type PartidaV04 = {
  id: string; numero: number; timeA: string; timeB: string; golsA: number; golsB: number;
  observacoes: string; status: StatusJogo; atletasA: string[]; atletasB: string[];
  golsPorAtleta: Record<string, number>; goleiroA: string | null; goleiroB: string | null;
  permitirGolsSemAutor: boolean; vinculoFormacao: boolean;
};
export type Partida = PartidaV04 & { equipeIdA: string | null; equipeIdB: string | null };
export type FormacaoV04 = { timeA: string; timeB: string; atletasA: string[]; atletasB: string[] };
export type RodadaV04 = { id: string; data: string; presencas: string[]; formacao: FormacaoV04 | null; jogos: PartidaV04[] };
export type DadosV04 = { versao: 4; jogadores: Jogador[]; rodadas: RodadaV04[] };
export type Rodada = { id: string; data: string; presencas: string[]; equipes: EquipeRodada[]; jogos: Partida[] };
export type ItemLixeira = { id: string; rodadaId: string; excluidoEm: string; jogo: Partida };
export type DadosSSW = { versao: 5; jogadores: Jogador[]; rodadas: Rodada[]; lixeira?: ItemLixeira[] };
export type Estatistica = { id: string; nome: string; presencas: number; jogos: number; pontos: number; gols: number; vitorias: number; empates: number; derrotas: number; jogosGoleiro: number; golsSofridos: number };

export const STORAGE_KEY_V05 = 'egidius.v05.clube';
export const STORAGE_KEY_V04 = 'egidius.v04.clube';
export const STORAGE_KEY_V03 = 'egidius.v03.clube';
export const STORAGE_KEY_V02 = 'egidius.v02.rodadas';
const CHANGE_EVENT = 'egidius:dados-alterados';

export function ehSabado(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value && date.getUTCDay() === 6;
}

export function proximoSabado(): string {
  const hoje = new Date();
  hoje.setDate(hoje.getDate() + (6 - hoje.getDay() + 7) % 7);
  const a = hoje.getFullYear(), m = String(hoje.getMonth() + 1).padStart(2, '0');
  return `${a}-${m}-${String(hoje.getDate()).padStart(2, '0')}`;
}

export function dataFormatada(data: string): string {
  const [ano, mes, dia] = data.split('-').map(Number);
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }).format(new Date(ano, mes - 1, dia, 12));
}

export function novoId(): string {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function registro(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function nonnegative(n: unknown): n is number { return typeof n === 'number' && Number.isInteger(n) && n >= 0; }
function idsValidos(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string');
}
function partidaV04Valida(p: unknown): p is PartidaV04 {
  if (!registro(p)) return false;
  if (typeof p.id !== 'string' || !nonnegative(p.numero) || typeof p.timeA !== 'string' || typeof p.timeB !== 'string' ||
      !nonnegative(p.golsA) || !nonnegative(p.golsB) || typeof p.observacoes !== 'string' ||
      (p.status !== 'rascunho' && p.status !== 'encerrada') || !idsValidos(p.atletasA) || !idsValidos(p.atletasB) ||
      !registro(p.golsPorAtleta) || (p.goleiroA !== null && typeof p.goleiroA !== 'string') ||
      (p.goleiroB !== null && typeof p.goleiroB !== 'string') || typeof p.permitirGolsSemAutor !== 'boolean' || typeof p.vinculoFormacao !== 'boolean') return false;
  return Object.values(p.golsPorAtleta).every(nonnegative);
}
function partidaValida(p: unknown): p is Partida {
  if (!partidaV04Valida(p)) return false;
  const raw = p as PartidaV04 & Record<string, unknown>;
  return (raw.equipeIdA === null || typeof raw.equipeIdA === 'string') &&
    (raw.equipeIdB === null || typeof raw.equipeIdB === 'string');
}
function formacaoV04Valida(f: unknown): f is FormacaoV04 {
  return registro(f) && typeof f.timeA === 'string' && typeof f.timeB === 'string' &&
    idsValidos(f.atletasA) && idsValidos(f.atletasB) &&
    new Set([...f.atletasA, ...f.atletasB]).size === f.atletasA.length + f.atletasB.length;
}
function dadosV04Validos(data: unknown): data is DadosV04 {
  if (!registro(data) || data.versao !== 4 || !Array.isArray(data.jogadores) || !Array.isArray(data.rodadas)) return false;
  return data.jogadores.every(j => registro(j) && typeof j.id === 'string' && typeof j.nome === 'string') &&
    data.rodadas.every(r => registro(r) && typeof r.id === 'string' && typeof r.data === 'string' && ehSabado(r.data) &&
      idsValidos(r.presencas) && (r.formacao === null || formacaoV04Valida(r.formacao)) &&
      Array.isArray(r.jogos) && r.jogos.every(partidaV04Valida));
}
function dadosValidos(data: unknown): data is DadosSSW {
  if (!registro(data) || data.versao !== 5 || !Array.isArray(data.jogadores) || !Array.isArray(data.rodadas)) return false;
  // A lixeira é opcional para manter a compatibilidade com os backups e sábados antigos.
  if (data.lixeira !== undefined) {
    if (!Array.isArray(data.lixeira) || data.lixeira.length > 200) return false;
    const idsAtivos = new Set(data.rodadas.flatMap(r => registro(r) && Array.isArray(r.jogos)
      ? r.jogos.filter(registro).map(j => j.id) : []));
    const idsLixeira = new Set<string>();
    const idsJogosExcluidos = new Set<string>();
    for (const item of data.lixeira) {
      if (!registro(item) || typeof item.id !== 'string' || !item.id || idsLixeira.has(item.id) ||
          typeof item.rodadaId !== 'string' || !item.rodadaId ||
          !data.rodadas.some(r => registro(r) && r.id === item.rodadaId) ||
          typeof item.excluidoEm !== 'string' || !Number.isFinite(Date.parse(item.excluidoEm)) ||
          !partidaValida(item.jogo) || item.jogo.status !== 'rascunho' ||
          idsAtivos.has(item.jogo.id) || idsJogosExcluidos.has(item.jogo.id)) return false;
      idsLixeira.add(item.id);
      idsJogosExcluidos.add(item.jogo.id);
    }
  }
  return data.jogadores.every(j => registro(j) && typeof j.id === 'string' && typeof j.nome === 'string') &&
    data.rodadas.every(r => {
      if (!registro(r) || typeof r.id !== 'string' || typeof r.data !== 'string' || !ehSabado(r.data) ||
          !idsValidos(r.presencas) || !Array.isArray(r.equipes) || !Array.isArray(r.jogos)) return false;
      const equipes = r.equipes;
      if (!equipes.every(e => registro(e) && typeof e.id === 'string' && typeof e.nome === 'string' && idsValidos(e.atletas))) return false;
      if (new Set(equipes.map(e => e.id)).size !== equipes.length) return false;
      if (new Set(equipes.flatMap(e => e.atletas)).size !== equipes.flatMap(e => e.atletas).length) return false;
      return r.jogos.every(j => partidaValida(j) &&
        (j.equipeIdA === null || equipes.some(e => e.id === j.equipeIdA)) &&
        (j.equipeIdB === null || equipes.some(e => e.id === j.equipeIdB)));
    });
}

/** Leitura em memória sem regravar os dados antigos; preserva integralmente os snapshots dos jogos. */
export function migrarV04(v04: DadosV04): DadosSSW {
  if (!dadosV04Validos(v04)) throw new Error('Os registros antigos não passaram na validação.');
  return {
    versao: 5,
    jogadores: v04.jogadores.map(j => ({ ...j })),
    rodadas: v04.rodadas.map(r => {
      const equipes: EquipeRodada[] = r.formacao ? [
        { id: `v04-${r.id}-a`, nome: r.formacao.timeA, atletas: [...r.formacao.atletasA] },
        { id: `v04-${r.id}-b`, nome: r.formacao.timeB, atletas: [...r.formacao.atletasB] },
      ] : [];
      const jogos: Partida[] = r.jogos.map(j => {
        const corresponde = !!r.formacao && j.vinculoFormacao &&
          j.timeA === r.formacao.timeA && j.timeB === r.formacao.timeB &&
          JSON.stringify(j.atletasA) === JSON.stringify(r.formacao.atletasA) &&
          JSON.stringify(j.atletasB) === JSON.stringify(r.formacao.atletasB);
        return { ...j, atletasA: [...j.atletasA], atletasB: [...j.atletasB],
          golsPorAtleta: { ...j.golsPorAtleta },
          equipeIdA: corresponde ? equipes[0].id : null,
          equipeIdB: corresponde ? equipes[1].id : null };
      });
      return { id: r.id, data: r.data, presencas: [...r.presencas], equipes, jogos };
    }),
  };
}

function migrarV03(raw: string | null): DadosV04 | null {
  if (raw === null) return null;
  let legacy: unknown;
  try { legacy = JSON.parse(raw); } catch { throw new Error('Não foi possível interpretar o armazenamento v0.3.'); }
  if (!registro(legacy) || legacy.versao !== 3 || !Array.isArray(legacy.jogadores) || !Array.isArray(legacy.rodadas)) {
    throw new Error('Dados v0.3 inesperados: a migração foi bloqueada para proteger os registros.');
  }
  const jogadores = legacy.jogadores.map(item => {
    if (!registro(item) || typeof item.id !== 'string' || typeof item.nome !== 'string') {
      throw new Error('Um cadastro v0.3 está inválido.');
    }
    return { id: item.id, nome: item.nome };
  });
  const rodadas = legacy.rodadas.map(item => {
    if (!registro(item) || typeof item.id !== 'string' || typeof item.data !== 'string' ||
        !ehSabado(item.data) || !idsValidos(item.presencas) || !Array.isArray(item.jogos)) {
      throw new Error('Uma rodada v0.3 não pode ser migrada.');
    }
    const jogos: PartidaV04[] = item.jogos.map(j => {
      if (!registro(j)) throw new Error('Há uma súmula v0.3 inválida.');
      const parte = { ...j, vinculoFormacao: false };
      if (!partidaV04Valida(parte)) throw new Error('Há uma súmula v0.3 inválida; nada foi sobrescrito.');
      return parte;
    });
    return { id: item.id, data: item.data, presencas: [...item.presencas],
      formacao: null, jogos };
  });
  return { versao: 4, jogadores, rodadas };
}

function migrarV02(raw: string | null): DadosV04 {
  if (!raw) return { versao: 4, jogadores: [], rodadas: [] };
  let legacy: unknown;
  try { legacy = JSON.parse(raw); } catch { throw new Error('Os registros antigos não puderam ser interpretados.'); }
  if (!Array.isArray(legacy)) throw new Error('Formato inesperado nos registros antigos de sábados.');
  const rodadas: RodadaV04[] = legacy.map(item => {
    if (!registro(item) || typeof item.id !== 'string' || typeof item.data !== 'string' || !ehSabado(item.data) || !Array.isArray(item.jogos)) {
      throw new Error('Um sábado antigo está inválido; a importação foi interrompida sem apagar dados.');
    }
    const jogos: PartidaV04[] = item.jogos.map(game => {
      if (!registro(game) || typeof game.id !== 'string' || !nonnegative(game.numero) ||
          typeof game.timeA !== 'string' || typeof game.timeB !== 'string' || !nonnegative(game.golsA) || !nonnegative(game.golsB) ||
          (game.status !== 'rascunho' && game.status !== 'encerrada')) throw new Error('Uma súmula anterior não pôde ser migrada.');
      return {
        id: game.id, numero: game.numero, timeA: game.timeA, timeB: game.timeB,
        golsA: game.golsA, golsB: game.golsB, observacoes: typeof game.observacoes === 'string' ? game.observacoes : '',
        status: game.status, atletasA: [], atletasB: [], golsPorAtleta: {}, goleiroA: null, goleiroB: null,
        permitirGolsSemAutor: false, vinculoFormacao: false,
      };
    });
    return { id: item.id, data: item.data, presencas: [], formacao: null, jogos };
  });
  rodadas.sort((a, b) => b.data.localeCompare(a.data));
  return { versao: 4, jogadores: [], rodadas };
}

let armazenamentoErro = '';
let armazenamentoPersistiu = true;
let leituraBloqueada = false;
function ler(): DadosSSW {
  try {
    const atual = window.localStorage.getItem(STORAGE_KEY_V05);
    if (atual !== null) {
      const valor: unknown = JSON.parse(atual);
      if (!dadosValidos(valor)) throw new Error('Armazenamento v0.5 inválido. Nenhum registro foi sobrescrito.');
      return valor;
    }
    const v04 = window.localStorage.getItem(STORAGE_KEY_V04);
    if (v04 !== null) {
      const valor: unknown = JSON.parse(v04);
      if (!dadosV04Validos(valor)) throw new Error('Armazenamento v0.4 inesperado. Migração interrompida para proteger o histórico.');
      return migrarV04(valor);
    }
    const v03 = migrarV03(window.localStorage.getItem(STORAGE_KEY_V03));
    return migrarV04(v03 ?? migrarV02(window.localStorage.getItem(STORAGE_KEY_V02)));
  } catch (error) {
    armazenamentoErro = error instanceof Error ? error.message : 'Não foi possível acessar o armazenamento local.';
    leituraBloqueada = true;
    armazenamentoPersistiu = false;
    return { versao: 5, jogadores: [], rodadas: [] };
  }
}
let cache = ler();
const assinantes = new Set<() => void>();
function avisar() { assinantes.forEach(callback => callback()); window.dispatchEvent(new Event(CHANGE_EVENT)); }
function assinar(callback: () => void) { assinantes.add(callback); return () => { assinantes.delete(callback); }; }
function snapshot() { return cache; }
export function useDadosSSW(): DadosSSW { return useSyncExternalStore(assinar, snapshot, snapshot); }
export function situacaoArmazenamento() { return { erro: armazenamentoErro, persistiu: armazenamentoPersistiu }; }

/** Histórico temporário por aba: somente ações explícitas e concluídas entram na pilha. */
type Historico = { antes: string; depois: string; descricao: string };
const desfaziveis: Historico[] = [];
const refaziveis: Historico[] = [];
export function historicoAcoes() {
  return { desfazer: desfaziveis.at(-1)?.descricao ?? null,
    refazer: refaziveis.at(-1)?.descricao ?? null };
}
function gravarTexto(conteudo: string): DadosSSW {
  if (leituraBloqueada) throw new Error('Dados locais inválidos: nenhuma alteração é permitida.');
  const dados: unknown = JSON.parse(conteudo);
  if (!dadosValidos(dados)) throw new Error('O histórico não passou na validação.');
  try {
    window.localStorage.setItem(STORAGE_KEY_V05, conteudo);
    armazenamentoErro = ''; armazenamentoPersistiu = true;
  } catch {
    armazenamentoErro = 'Falha ao salvar. Nenhuma alteração foi confirmada.';
    armazenamentoPersistiu = false;
    avisar();
    throw new Error(armazenamentoErro);
  }
  return dados;
}
export function desfazerAcao(): string {
  const ultima = desfaziveis.at(-1);
  if (!ultima) throw new Error('Nenhuma ação recente disponível para desfazer nesta aba.');
  if (JSON.stringify(cache) !== ultima.depois) throw new Error('Os dados mudaram. O histórico não pode ser aplicado com segurança.');
  const restored = gravarTexto(ultima.antes);
  desfaziveis.pop(); refaziveis.push(ultima);
  cache = restored; avisar();
  return ultima.descricao;
}
export function refazerAcao(): string {
  const ultima = refaziveis.at(-1);
  if (!ultima) throw new Error('Nenhuma ação recente disponível para refazer nesta aba.');
  if (JSON.stringify(cache) !== ultima.antes) throw new Error('Os dados mudaram. O histórico não pode ser reaplicado com segurança.');
  const restored = gravarTexto(ultima.depois);
  refaziveis.pop(); desfaziveis.push(ultima);
  cache = restored; avisar();
  return ultima.descricao;
}
export function atualizarDados(updater: (dados: DadosSSW) => DadosSSW, descricaoHistorico?: string) {
  if (leituraBloqueada) throw new Error('A leitura dos dados locais falhou. Por segurança, não é permitido sobrescrevê-los. Exporte os dados antigos pelas ferramentas do navegador antes de qualquer correção.');
  const antes = JSON.stringify(cache);
  const proposed = updater(cache);
  if (!dadosValidos(proposed)) throw new Error('Operação bloqueada por produzir dados inválidos.');
  const depois = JSON.stringify(proposed);
  if (antes === depois) return;
  const confirmado = gravarTexto(depois);
  if (descricaoHistorico) {
    desfaziveis.push({ antes, depois, descricao: descricaoHistorico });
    if (desfaziveis.length > 12) desfaziveis.shift();
  } else {
    // Uma edição livre no formulário invalida o histórico para não sobrescrever alterações posteriores.
    desfaziveis.length = 0;
  }
  refaziveis.length = 0;
  cache = confirmado;
  avisar();
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', event => {
    if (event.key === STORAGE_KEY_V05) { leituraBloqueada = false; desfaziveis.length = 0; refaziveis.length = 0; cache = ler(); avisar(); }
  });
}

export function exportarBackup() {
  const conteudo = JSON.stringify({ ...cache, exportadoEm: new Date().toISOString() }, null, 2);
  const url = URL.createObjectURL(new Blob([conteudo], { type: 'application/json;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `egidius-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function resumoSSW(dados: DadosSSW) {
  const fechados = dados.rodadas.flatMap(r => r.jogos).filter(j => j.status === 'encerrada');
  const partidas = dados.rodadas.flatMap(r => r.jogos);
  return {
    rodadas: dados.rodadas.length, partidas: partidas.length, encerradas: fechados.length,
    gols: fechados.reduce((s, j) => s + j.golsA + j.golsB, 0),
    presentesUltimoSabado: [...dados.rodadas].sort((a, b) => b.data.localeCompare(a.data))[0]?.presencas.length ?? 0,
  };
}

export function classificar(dados: DadosSSW): Estatistica[] {
  const stats = new Map<string, Estatistica>();
  for (const jogador of dados.jogadores) {
    stats.set(jogador.id, { id: jogador.id, nome: jogador.nome, presencas: 0, jogos: 0, pontos: 0, gols: 0,
      vitorias: 0, empates: 0, derrotas: 0, jogosGoleiro: 0, golsSofridos: 0 });
  }
  for (const rodada of dados.rodadas) {
    for (const id of new Set(rodada.presencas)) { const registro = stats.get(id); if (registro) registro.presencas++; }
    for (const jogo of rodada.jogos) {
      if (jogo.status !== 'encerrada') continue;
      for (const side of ['A', 'B'] as const) {
        const squad = side === 'A' ? jogo.atletasA : jogo.atletasB;
        const favor = side === 'A' ? jogo.golsA : jogo.golsB;
        const contra = side === 'A' ? jogo.golsB : jogo.golsA;
        const keeper = side === 'A' ? jogo.goleiroA : jogo.goleiroB;
        for (const id of new Set(squad)) {
          const result = stats.get(id);
          if (!result) continue;
          result.jogos++;
          result.gols += jogo.golsPorAtleta[id] ?? 0;
          result.pontos += favor > contra ? 3 : favor === contra ? 1 : 0;
          if (favor > contra) result.vitorias++;
          else if (favor === contra) result.empates++;
          else result.derrotas++;
          if (id === keeper) { result.jogosGoleiro++; result.golsSofridos += contra; }
        }
      }
    }
  }
  return [...stats.values()];
}

/** Etapa 07: adoção explícita de um snapshot validado vindo do servidor. */
export function obterDadosAtuais(): DadosSSW { return cache; }
export function observarMudancas(callback: () => void): () => void { return assinar(callback); }
export function adotarDadosDoServidor(value: DadosSSW): void {
  if (leituraBloqueada) throw new Error('Os dados locais estão corrompidos. Corrija ou exporte-os antes de sincronizar.');
  if (!dadosValidos(value)) throw new Error('Dados recebidos do servidor inválidos. O navegador não foi alterado.');
  const result = gravarTexto(JSON.stringify(value));
  desfaziveis.length = 0; refaziveis.length = 0;
  cache = result;
  avisar();
}
