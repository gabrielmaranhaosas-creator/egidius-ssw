import sqlite3

def connect_db():
    # Conecta ao banco de dados (cria o arquivo se não existir)
    return sqlite3.connect("data/egidius.db", check_same_thread=False)

def create_tables():
    conn = connect_db()
    cursor = conn.cursor()
    
    # 1. Tabela de Atletas
    cursor.execute('''CREATE TABLE IF NOT EXISTS jogadores (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT UNIQUE NOT NULL
    )''')
    
    # 2. Tabela de Rodadas (Sábados)
    cursor.execute('''CREATE TABLE IF NOT EXISTS rodadas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        data DATE UNIQUE NOT NULL
    )''')
    
    # 3. Tabela de Presença (Ordem de chegada)
    cursor.execute('''CREATE TABLE IF NOT EXISTS presencas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        rodada_id INTEGER,
        jogador_id INTEGER,
        ordem INTEGER,
        madrugador INTEGER DEFAULT 0,
        FOREIGN KEY(rodada_id) REFERENCES rodadas(id),
        FOREIGN KEY(jogador_id) REFERENCES jogadores(id)
    )''')
    
    # 4. Tabela de Partidas
    cursor.execute('''CREATE TABLE IF NOT EXISTS partidas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        rodada_id INTEGER,
        gols_a INTEGER,
        gols_b INTEGER,
        juiz_id INTEGER,
        mesario_id INTEGER,
        FOREIGN KEY(rodada_id) REFERENCES rodadas(id)
    )''')

    # 5. Tabela de Participações (Quem jogou em qual time e quantos gols fez)
    cursor.execute('''CREATE TABLE IF NOT EXISTS participacoes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        partida_id INTEGER,
        jogador_id INTEGER,
        time TEXT, 
        eh_goleiro INTEGER DEFAULT 0,
        gols_marcados INTEGER DEFAULT 0,
        FOREIGN KEY(partida_id) REFERENCES partidas(id)
    )''')
    
    conn.commit()
    conn.close()