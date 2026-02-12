import sqlite3
import os

def connect_db():
    if not os.path.exists("data"):
        os.makedirs("data")
    return sqlite3.connect("data/egidius.db", check_same_thread=False)

def create_tables():
    conn = connect_db()
    cursor = conn.cursor()
    # Tabelas base
    cursor.execute('CREATE TABLE IF NOT EXISTS jogadores (id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT UNIQUE NOT NULL, bio TEXT, foto_url TEXT)')
    cursor.execute('CREATE TABLE IF NOT EXISTS rodadas (id INTEGER PRIMARY KEY AUTOINCREMENT, data DATE UNIQUE NOT NULL)')
    cursor.execute('CREATE TABLE IF NOT EXISTS presencas (id INTEGER PRIMARY KEY AUTOINCREMENT, rodada_id INTEGER, jogador_id INTEGER, ordem INTEGER, madrugador INTEGER DEFAULT 0)')
    cursor.execute('CREATE TABLE IF NOT EXISTS partidas (id INTEGER PRIMARY KEY AUTOINCREMENT, rodada_id INTEGER, data_hora TEXT, gols_a INTEGER, gols_b INTEGER, juiz_id INTEGER, mesario_id INTEGER)')
    cursor.execute('CREATE TABLE IF NOT EXISTS participacoes (id INTEGER PRIMARY KEY AUTOINCREMENT, partida_id INTEGER, jogador_id INTEGER, time TEXT, eh_goleiro INTEGER DEFAULT 0, gols_marcados INTEGER DEFAULT 0, link_video TEXT)')
    conn.commit()
    conn.close()