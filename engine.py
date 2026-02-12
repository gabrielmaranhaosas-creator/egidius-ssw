from database import connect_db

def get_rankings():
    conn = connect_db()
    cursor = conn.cursor()
    
    # Ranking de Pontos (3-1-0) - Agora processado puramente em SQL
    query_pontos = """
    SELECT j.nome, 
           SUM(CASE 
               WHEN (p.time = 'A' AND m.gols_a > m.gols_b) OR (p.time = 'B' AND m.gols_b > m.gols_a) THEN 3
               WHEN m.gols_a = m.gols_b THEN 1
               ELSE 0 END) as PTOS,
           COUNT(p.id) as JOGOS,
           SUM(p.gols_marcados) as GOLS
    FROM participacoes p
    JOIN partidas m ON p.partida_id = m.id
    JOIN jogadores j ON p.jogador_id = j.id
    GROUP BY j.nome ORDER BY PTOS DESC, GOLS DESC
    """
    
    # Ranking de Goleiros
    query_goleiros = """
    SELECT j.nome, 
           SUM(CASE WHEN p.time = 'A' THEN m.gols_b ELSE m.gols_a END) as SOFRIDOS,
           COUNT(p.id) as JOGOS
    FROM participacoes p
    JOIN partidas m ON p.partida_id = m.id
    JOIN jogadores j ON p.jogador_id = j.id
    WHERE p.eh_goleiro = 1
    GROUP BY j.nome
    """
    
    cursor.execute(query_pontos)
    pontos = cursor.fetchall() # Retorna uma lista simples
    
    cursor.execute(query_goleiros)
    goleiros_raw = cursor.fetchall()
    
    # Calcula a média manualmente (sem pandas)
    goleiros = []
    for g in goleiros_raw:
        nome, sofridos, jogos = g
        media = round(sofridos / jogos, 2) if jogos > 0 else 0
        goleiros.append((nome, sofridos, jogos, media))
    
    # Ordena goleiros pela menor média
    goleiros.sort(key=lambda x: x[3])

    conn.close()
    return pontos, goleiros