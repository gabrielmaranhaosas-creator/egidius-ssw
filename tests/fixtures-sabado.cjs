// Todos os nomes e resultados deste arquivo são fictícios e usados apenas nos testes.
function equipes() {
  return ['Branco', 'Colorido', 'Azul'].map((nome, n) => ({
    id: 'teste-time-' + n, nome,
    atletas: Array.from({ length: 7 }, (_, i) => 'teste-atleta-' + (n * 7 + i + 1)),
  }));
}
function rodada(jogos = [], times = equipes()) {
  return { id: 'teste-sabado', data: '2026-10-31',
    presencas: times.flatMap(e => e.atletas), equipes: times, jogos };
}
function jogadores(times = equipes()) {
  return times.flatMap(e => e.atletas).map((id, i) => ({ id, nome: 'Atleta de teste ' + (i + 1) }));
}
module.exports = { equipes, rodada, jogadores };
