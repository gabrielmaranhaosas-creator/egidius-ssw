import streamlit as st
from datetime import datetime
import pandas as pd
import sqlite3
import os
import io
import base64

# --- 1. BANCO DE DADOS ---
def connect_db():
    if not os.path.exists("data"):
        os.makedirs("data")
    return sqlite3.connect("data/egidius.db", check_same_thread=False)

def create_tables():
    conn = connect_db()
    cursor = conn.cursor()
    cursor.execute('CREATE TABLE IF NOT EXISTS jogadores (id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT UNIQUE NOT NULL)')
    cursor.execute('CREATE TABLE IF NOT EXISTS rodadas (id INTEGER PRIMARY KEY AUTOINCREMENT, data DATE UNIQUE NOT NULL)')
    cursor.execute('CREATE TABLE IF NOT EXISTS presencas (id INTEGER PRIMARY KEY AUTOINCREMENT, rodada_id INTEGER, jogador_id INTEGER, ordem INTEGER)')
    cursor.execute('CREATE TABLE IF NOT EXISTS partidas (id INTEGER PRIMARY KEY AUTOINCREMENT, rodada_id INTEGER, numero_jogo INTEGER, time_a_gols INTEGER DEFAULT 0, time_b_gols INTEGER DEFAULT 0)')
    cursor.execute('CREATE TABLE IF NOT EXISTS participacoes (id INTEGER PRIMARY KEY AUTOINCREMENT, partida_id INTEGER, jogador_id INTEGER, time TEXT, gols INTEGER DEFAULT 0)')
    conn.commit()
    conn.close()

# --- 2. FUNÇÃO PARA INJETAR A LOGO NO CABEÇALHO ---
def get_base64_image(image_path):
    try:
        with open(image_path, "rb") as img_file:
            return base64.b64encode(img_file.read()).decode()
    except FileNotFoundError:
        return ""

# --- 3. SETUP E DESIGN SISTÊMICO ---
st.set_page_config(page_title="EGIDIUS - SSW", layout="wide")

# Processa a imagem PNG para o HTML
logo_base64 = get_base64_image("logo.png")
img_html = f"<img src='data:image/png;base64,{logo_base64}' style='width: 120px; vertical-align: middle; margin-right: 20px; border-radius: 50%;'>" if logo_base64 else ""

st.markdown("""
    <style>
    @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;700;900&display=swap');
    * { font-family: 'Montserrat', sans-serif; }
    .stApp { background-color: #FFFFFF; }
    
    /* Sidebar Preta e Amarela */
    [data-testid="stSidebar"] {
        background-color: #1A1A1A;
        border-right: 5px solid #FFD700;
    }
    [data-testid="stSidebar"] * { color: white !important; }
    
    /* Banner Principal com Logo */
    .main-header {
        background-color: #155724;
        padding: 20px 40px;
        border-radius: 12px;
        color: #FFD700;
        display: flex;
        align-items: center;
        justify-content: center;
        border-bottom: 6px solid #CC0000;
        margin-bottom: 30px;
        box-shadow: 0 4px 10px rgba(0,0,0,0.15);
    }
    .main-header h1 {
        margin: 0;
        font-size: 36px;
        font-weight: 900;
        display: inline-block;
        vertical-align: middle;
    }
    
    /* Blocos de Conteúdo (Cards Brancos) */
    .content-card {
        background-color: #FFFFFF;
        padding: 25px;
        border: 1px solid #E0E0E0;
        border-radius: 8px;
        margin-bottom: 20px;
        box-shadow: 0 2px 4px rgba(0,0,0,0.05);
    }
    
    /* Botões Padrão SSW */
    .stButton>button {
        background-color: #155724;
        color: white;
        font-weight: bold;
        border-radius: 6px;
        border: 2px solid #FFD700;
        width: 100%;
        height: 45px;
        transition: 0.3s;
    }
    .stButton>button:hover {
        background-color: #FFD700;
        color: #1A1A1A;
        border: 2px solid #1A1A1A;
    }
    </style>
    """, unsafe_allow_html=True)

create_tables()
conn = connect_db()
hoje_str = datetime.now().date().isoformat()

# Renderiza o Cabeçalho com a Logo
st.markdown(f"<div class='main-header'>{img_html}<h1>EGIDIUS - SSW</h1></div>", unsafe_allow_html=True)

# Navegação
menu = ["📍 Marcar Presença", "🎮 Súmula do Jogo", "🏆 Artilharia e Presença", "📖 Nossa História", "📥 Exportar Dados", "⚙️ CONFIG"]
choice = st.sidebar.radio("NAVEGAÇÃO", menu)

# --- ABA: SÚMULA DO JOGO ---
if choice == "🎮 Súmula do Jogo":
    st.markdown("### Registro de Partidas e Gols")
    presentes_hoje = conn.execute("SELECT j.id, j.nome FROM jogadores j JOIN presencas p ON j.id = p.jogador_id JOIN rodadas r ON r.id = p.rodada_id WHERE r.data=?", (hoje_str,)).fetchall()
    nomes = [a[1] for a in presentes_hoje]
    id_map = {a[1]: a[0] for a in presentes_hoje}

    if not nomes:
        st.info("Aguardando lista de presença para escalar os times.")
    else:
        rodada_id = conn.execute("SELECT id FROM rodadas WHERE data=?", (hoje_str,)).fetchone()[0]
        num_jogo = conn.execute("SELECT COUNT(*) FROM partidas WHERE rodada_id=?", (rodada_id,)).fetchone()[0] + 1

        col_l, col_r = st.columns(2)
        with col_l:
            st.markdown("<div class='content-card'>", unsafe_allow_html=True)
            st.write(f"#### PARTIDA Nº {num_jogo}")
            time_a = st.multiselect("Time Branco", nomes)
            gols_a = st.number_input("Gols do Branco", 0, 20)
            st.markdown("</div>", unsafe_allow_html=True)
        with col_r:
            st.markdown("<div class='content-card'>", unsafe_allow_html=True)
            st.write("#### Adversário")
            time_b = st.multiselect("Time Colorido", nomes)
            gols_b = st.number_input("Gols do Colorido", 0, 20)
            st.markdown("</div>", unsafe_allow_html=True)

        st.markdown("<div class='content-card'>", unsafe_allow_html=True)
        st.write("#### Quem marcou hoje?")
        marcador = st.selectbox("Atleta", [""] + nomes)
        qtd_gols = st.number_input("Total de Gols deste Atleta no jogo", 1, 10)
        
        if st.button("GRAVAR SÚMULA"):
            if time_a and time_b:
                cursor = conn.cursor()
                cursor.execute("INSERT INTO partidas (rodada_id, numero_jogo, time_a_gols, time_b_gols) VALUES (?,?,?,?)", (rodada_id, num_jogo, gols_a, gols_b))
                p_id = cursor.lastrowid
                for n in time_a:
                    g = qtd_gols if n == marcador else 0
                    conn.execute("INSERT INTO participacoes (partida_id, jogador_id, time, gols) VALUES (?,?,?,?)", (p_id, id_map[n], 'A', g))
                for n in time_b:
                    g = qtd_gols if n == marcador else 0
                    conn.execute("INSERT INTO participacoes (partida_id, jogador_id, time, gols) VALUES (?,?,?,?)", (p_id, id_map[n], 'B', g))
                conn.commit()
                st.success("Partida gravada no banco de dados!")
                st.rerun()
            else:
                st.error("Escale os dois times antes de gravar.")
        st.markdown("</div>", unsafe_allow_html=True)

# --- ABA: MARCAR PRESENÇA ---
elif choice == "📍 Marcar Presença":
    st.markdown("### Lista de Presença e Check-in")
    conn.execute("INSERT OR IGNORE INTO rodadas (data) VALUES (?)", (hoje_str,))
    conn.commit()
    rodada_id = conn.execute("SELECT id FROM rodadas WHERE data=?", (hoje_str,)).fetchone()[0]
    
    todos = conn.execute("SELECT id, nome FROM jogadores ORDER BY nome").fetchall()
    presentes = conn.execute("SELECT p.id, j.nome, p.ordem FROM presencas p JOIN jogadores j ON p.jogador_id = j.id WHERE p.rodada_id=? ORDER BY p.ordem", (rodada_id,)).fetchall()
    pres_nomes = [p[1] for p in presentes]

    col1, col2 = st.columns(2)
    with col1:
        st.markdown("<div class='content-card'>", unsafe_allow_html=True)
        st.write("#### Confirmar Presença")
        for j_id, j_nome in todos:
            if j_nome not in pres_nomes:
                if st.button(f"Registrar {j_nome}", key=f"in_{j_id}"):
                    conn.execute("INSERT INTO presencas (rodada_id, jogador_id, ordem) VALUES (?,?,?)", (rodada_id, j_id, len(presentes)+1))
                    conn.commit()
                    st.rerun()
        st.markdown("</div>", unsafe_allow_html=True)
    with col2:
        st.markdown("<div class='content-card'>", unsafe_allow_html=True)
        st.write("#### Ordem de Chegada")
        for p_id, p_nome, p_ord in presentes:
            if st.button(f"Remover {p_nome} (#{p_ord})", key=f"out_{p_id}"):
                conn.execute("DELETE FROM presencas WHERE id=?", (p_id,))
                conn.commit()
                st.rerun()
        st.markdown("</div>", unsafe_allow_html=True)

# --- ABA: RANKINGS ---
elif choice == "🏆 Artilharia e Presença":
    st.markdown("### Rankings da Temporada")
    col1, col2 = st.columns(2)
    with col1:
        st.markdown("<div class='content-card'>", unsafe_allow_html=True)
        st.write("#### 🎯 Artilheiros")
        data = conn.execute("SELECT j.nome, SUM(p.gols) as t FROM participacoes p JOIN jogadores j ON p.jogador_id = j.id GROUP BY j.nome ORDER BY t DESC").fetchall()
        for i, r in enumerate(data): st.write(f"**{i+1}º {r[0]}** — {r[1]} Gols")
        st.markdown("</div>", unsafe_allow_html=True)
    with col2:
        st.markdown("<div class='content-card'>", unsafe_allow_html=True)
        st.write("#### 🥇 Presença")
        data = conn.execute("SELECT j.nome, COUNT(DISTINCT r.id) FROM presencas p JOIN jogadores j ON p.jogador_id = j.id JOIN rodadas r ON r.id = p.rodada_id GROUP BY j.nome ORDER BY COUNT(r.id) DESC").fetchall()
        for i, r in enumerate(data): st.write(f"**{i+1}º {r[0]}** — {r[1]} Rodadas")
        st.markdown("</div>", unsafe_allow_html=True)

# --- ABA: EXPORTAR ---
elif choice == "📥 Exportar Dados":
    st.markdown("### Exportar Estatísticas")
    st.markdown("<div class='content-card'>", unsafe_allow_html=True)
    if st.button("GERAR EXCEL"):
        df = pd.read_sql_query("SELECT j.nome, SUM(p.gols) as Gols FROM participacoes p JOIN jogadores j ON p.jogador_id = j.id GROUP BY j.nome", conn)
        buffer = io.BytesIO()
        with pd.ExcelWriter(buffer, engine='openpyxl') as writer:
            df.to_excel(writer, index=False)
        st.download_button("Baixar Arquivo Excel", buffer.getvalue(), f"SSW_Relatorio.xlsx")
    st.markdown("</div>", unsafe_allow_html=True)

# --- ABA: CONFIG ---
elif choice == "⚙️ CONFIG":
    st.markdown("### Painel de Controle")
    st.markdown("<div class='content-card'>", unsafe_allow_html=True)
    nome = st.text_input("Nome do Atleta")
    if st.button("Salvar Cadastro"):
        conn.execute("INSERT OR IGNORE INTO jogadores (nome) VALUES (?)", (nome,))
        conn.commit()
        st.success(f"{nome} cadastrado com sucesso!")
    st.divider()
    if st.button("RESET TOTAL DE DADOS"):
        conn.execute("DELETE FROM participacoes"); conn.execute("DELETE FROM partidas")
        conn.execute("DELETE FROM presencas"); conn.execute("DELETE FROM rodadas")
        conn.execute("DELETE FROM jogadores"); conn.commit(); st.rerun()
    st.markdown("</div>", unsafe_allow_html=True)

conn.close()