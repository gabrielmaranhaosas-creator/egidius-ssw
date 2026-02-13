import database as db

def get_rankings():
    conn = db.connect_db()
    # Ranking Presença
    query_presenca = """
        SELECT j.nome, COUNT(p.rodada_id) as frequencia 
        FROM jogadores j 
        LEFT JOIN presencas p ON j.id = p.jogador_id 
        GROUP BY j.nome 
        ORDER BY frequencia DESC
    """
    presenca = conn.execute(query_presenca).fetchall()
    
    # Ranking Artilharia
    query_gols = """
        SELECT j.nome, SUM(g.quantidade) as total_gols 
        FROM jogadores j 
        LEFT JOIN gols g ON j.id = g.jogador_id 
        GROUP BY j.nome 
        ORDER BY total_gols DESC
    """
    artilharia = conn.execute(query_gols).fetchall()
    
    conn.close()
    return presenca, artilharia