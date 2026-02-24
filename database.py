import sqlite3
import os

def connect_db():
    if not os.path.exists("data"):
        os.makedirs("data")
    return sqlite3.connect("data/egidius.db", check_same_thread=False)

def create_tables():
    conn = connect_db()
    cursor = conn.cursor()
    # Atletas
    cursor.execute('CREATE TABLE IF NOT EXISTS jogadores (id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT UNIQUE NOT NULL)')
    # Rodadas (Datas)
    cursor.execute('CREATE TABLE IF NOT EXISTS rodadas (id INTEGER PRIMARY KEY AUTOINCREMENT, data DATE UNIQUE NOT NULL)')
    # Presenças
    cursor.execute('CREATE TABLE IF NOT EXISTS presencas (id INTEGER PRIMARY KEY AUTOINCREMENT, rodada_id INTEGER, jogador_id INTEGER, ordem INTEGER)')
    # Partidas Sequenciais (Jogo 1, Jogo 2...)
    cursor.execute('CREATE TABLE IF NOT EXISTS partidas (id INTEGER PRIMARY KEY AUTOINCREMENT, rodada_id INTEGER, numero_jogo INTEGER, time_a_gols INTEGER DEFAULT 0, time_b_gols INTEGER DEFAULT 0)')
    # Participações e Gols por Jogo
    cursor.execute('CREATE TABLE IF NOT EXISTS participacoes (id INTEGER PRIMARY KEY AUTOINCREMENT, partida_id INTEGER, jogador_id INTEGER, time TEXT, gols INTEGER DEFAULT 0, link_video TEXT)')
    conn.commit()
    conn.close()