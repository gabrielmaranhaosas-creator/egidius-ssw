import type { DadosSSW } from './SSWStore';

export function normalizarNomeCadastro(nome: string): string {
  return nome.normalize('NFC').trim().replace(/\s+/g, ' ');
}

/** Cadastro e presença opcional constituem uma única ação, sem gravações parciais. */
export function cadastrarJogador(dados: DadosSSW, nomeInformado: string, id: string, rodadaId?: string): DadosSSW {
  const nome = normalizarNomeCadastro(nomeInformado);
  if (nome.length < 2 || nome.length > 70) throw new Error('Informe o nome do jogador (entre 2 e 70 caracteres).');
  if (dados.jogadores.some(j => normalizarNomeCadastro(j.nome).toLocaleLowerCase('pt-BR') === nome.toLocaleLowerCase('pt-BR'))) {
    throw new Error('Esse jogador já está cadastrado. Use a lista de chegadas para registrar sua presença.');
  }
  if (!id.trim() || dados.jogadores.some(j => j.id === id)) throw new Error('Não foi possível gerar um identificador único para o jogador.');
  if (rodadaId !== undefined && !dados.rodadas.some(r => r.id === rodadaId)) {
    throw new Error('O sábado selecionado não existe mais. Escolha um sábado antes de cadastrar e marcar a chegada.');
  }
  return {
    ...dados,
    jogadores: [...dados.jogadores, { id, nome }],
    rodadas: rodadaId === undefined ? dados.rodadas : dados.rodadas.map(r => r.id === rodadaId
      ? { ...r, presencas: [...r.presencas.filter(p => p !== id), id] } : r),
  };
}
