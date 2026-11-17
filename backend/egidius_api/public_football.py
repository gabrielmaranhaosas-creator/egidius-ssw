"""Projeção pública somente do futebol, sem fichas, arquivos ou histórico privado."""
from .schema import DadosSSW


def public_football(payload: str) -> dict:
    data = DadosSSW.model_validate_json(payload)
    players = [{'id': p.id, 'nome': p.nome} for p in data.jogadores]
    stats = {p.id: dict(id=p.id, nome=p.nome, presencas=0, jogos=0, pontos=0,
                       gols=0, vitorias=0, empates=0, derrotas=0,
                       jogosGoleiro=0, golsSofridos=0) for p in data.jogadores}
    rounds = []
    for r in data.rodadas:
        games = []
        for g in r.jogos:
            # Lista explícita: campos novos do estado nunca se tornam públicos por acaso.
            games.append(dict(id=g.id, numero=g.numero, timeA=g.timeA, timeB=g.timeB,
                              golsA=g.golsA, golsB=g.golsB, status=g.status,
                              atletasA=list(g.atletasA), atletasB=list(g.atletasB),
                              goleiroA=g.goleiroA, goleiroB=g.goleiroB,
                              golsPorAtleta=dict(g.golsPorAtleta)))
            if g.status != 'encerrada':
                continue
            for squad, favor, contra, keeper in ((g.atletasA, g.golsA, g.golsB, g.goleiroA),
                                                  (g.atletasB, g.golsB, g.golsA, g.goleiroB)):
                for player_id in set(squad):
                    s = stats.get(player_id)
                    if s is None:
                        continue
                    s['jogos'] += 1
                    s['gols'] += g.golsPorAtleta.get(player_id, 0)
                    s['pontos'] += 3 if favor > contra else 1 if favor == contra else 0
                    s['vitorias'] += int(favor > contra)
                    s['empates'] += int(favor == contra)
                    s['derrotas'] += int(favor < contra)
                    if player_id == keeper:
                        s['jogosGoleiro'] += 1
                        s['golsSofridos'] += contra
        for player_id in set(r.presencas):
            if player_id in stats:
                stats[player_id]['presencas'] += 1
        rounds.append(dict(id=r.id, data=r.data, presencas=list(r.presencas),
                           equipes=[dict(id=e.id, nome=e.nome, atletas=list(e.atletas)) for e in r.equipes],
                           jogos=games))
    return dict(jogadores=players, rodadas=rounds, rankings=list(stats.values()))
