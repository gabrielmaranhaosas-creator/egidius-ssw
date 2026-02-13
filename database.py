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
    # Frequência
    cursor.execute('CREATE TABLE IF NOT EXISTS rodadas (id INTEGER PRIMARY KEY AUTOINCREMENT, data DATE UNIQUE NOT NULL)')
    cursor.execute('CREATE TABLE IF NOT EXISTS presencas (id INTEGER PRIMARY KEY AUTOINCREMENT, rodada_id INTEGER, jogador_id INTEGER, ordem INTEGER)')
    # Gols
    cursor.execute('CREATE TABLE IF NOT EXISTS gols (id INTEGER PRIMARY KEY AUTOINCREMENT, jogador_id INTEGER, quantidade INTEGER, link_video TEXT, data_registro TEXT)')
    conn.commit()
    conn.close()