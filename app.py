import streamlit as st
from datetime import datetime
import database as db
import csv
import io

# --- DESIGN SYSTEM SSW ---
st.set_page_config(page_title="EGIDIUS - SSW", layout="wide")

st.markdown("""
    <style>
    @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;700;900&display=swap');
    * { font-family: 'Montserrat', sans-serif; }
    .stApp { background-color: #FFFFFF; }
    .header-ssw {
        background-color: #155724; padding: 40px; border-radius: 0 0 30px 30px;
        color: white; text-align: center; border-bottom: 4px solid #B8860B;
    }
    .match-card {
        background-color: #f8f9fa; padding: 20px; border-radius: 15px;
        border: 1px solid #e0e0e0; margin-bottom: 20px;
    }
    .stButton>button {
        border-radius: 12px; height: 50px; font-weight: 700;
        border: 2px solid #155724; color: #155724; background: white;
    }
    .stButton>button:hover { background-color: #155724; color: white; }
    </style>
    """, unsafe_allow_html=True)

db.create_tables()
conn = db.connect_db()

st.markdown("<div class='header-ssw'><h1>EGIDIUS - SSW</h1></div>", unsafe_allow_html=True)

# ORDEM DAS JANELAS CORRIGIDA
menu = [
    "📍 Marcar Presença", 
    "🎮 Súmula do Jogo",  # A aba que faltava para os dias de jogo
    "🏆 Artilharia e Presença", 
    "📖 Nossa História", 
    "📥 Exportar Dados", 
    "⚙️ CONFIG"
]
choice = st.sidebar.radio("MENU", menu)
hoje_str = datetime.now().date().isoformat()

# --- 1. MARCAR PRESENÇA ---
if choice == "📍 Marcar Presença":
    st.subheader("📋 Check-in: Ordem de Chegada")
    conn.execute("INSERT OR IGNORE INTO rodadas (data) VALUES (?)", (hoje_str,))
    conn.commit()
    res_r = conn.execute("SELECT id FROM rodadas WHERE data=?", (hoje_str,)).fetchone()
    rodada_id = res_r[0]
    
    cursor = conn.cursor()
    cursor.execute("SELECT id, nome FROM jogadores ORDER BY nome")
    todos = cursor.fetchall()
    cursor.execute("SELECT p.id, j.nome, p.ordem FROM presencas p JOIN jogadores j ON p.jogador_id = j.id WHERE p.rodada_id=?", (rodada_id,))
    presentes = cursor.fetchall()
    pres_nomes = [p[1] for p in presentes]

    col1, col2 = st.columns(2)
    with col1:
        st.write("#### Registrar Entrada")
        for j_id, j_nome in todos:
            if j_nome not in pres_nomes:
                if st.button(f"➕ {j_nome}", key=f"in_{j_id}", use_container_width=True):
                    conn.execute("INSERT INTO presencas (rodada_id, jogador_id, ordem) VALUES (?,?,?)", (rodada_id, j_id, len(presentes)+1))
                    conn.commit()
                    st.rerun()
    with col2:
        st.write("#### Gerenciar / Remover")
        for p_id, p_nome, p_ord in presentes:
            if st.button(f"❌ {p_nome} (#{p_ord})", key=f"out_{p_id}", use_container_width=True):
                conn.execute("DELETE FROM presencas WHERE id=?", (p_id,))
                conn.commit()
                st.rerun()

# --- 2. SÚMULA DO JOGO (ESCADAÇÃO E GOLS) ---
elif choice == "🎮 Súmula do Jogo":
    st.subheader("⚽ Configuração da Partida")
    cursor = conn.cursor()
    cursor.execute("SELECT j.id, j.nome FROM jogadores j JOIN presencas p ON j.id = p.jogador_id JOIN rodadas r ON r.id = p.rodada_id WHERE r.data=?", (hoje_str,))
    presentes_hoje = cursor.fetchall()
    nomes = [n[1] for n in presentes_hoje]
    id_map = {n[1]: n[0] for n in presentes_hoje}

    if not nomes:
        st.info("Aguardando lista de presença para escalar os times.")
    else:
        with st.form("form_partida"):
            c1, c2 = st.columns(2)
            with c1:
                st.markdown("#### ⚪ TIME BRANCO")
                time_a = st.multiselect("Jogadores Branco", nomes, key="ta")
            with c2:
                st.markdown("#### 🟢 TIME COLORIDO")
                time_b = st.multiselect("Jogadores Colorido", nomes, key="tb")
            
            st.divider()
            st.write("#### 🎯 Registro de Gols")
            marcador = st.selectbox("Quem fez o gol?", [""] + nomes)
            qtd_gols = st.number_input("Total de Gols deste Atleta", 1, 10)
            video = st.text_input("Link do Vídeo (Opcional)")

            if st.form_submit_button("GRAVAR DADOS DO JOGO"):
                if marcador != "":
                    j_id = id_map[marcador]
                    conn.execute("INSERT INTO gols (jogador_id, quantidade, link_video, data_registro) VALUES (?,?,?,?)", 
                                 (j_id, qtd_gols, video, hoje_str))
                    conn.commit()
                    st.success(f"Dados salvos! Gol de {marcador} computado para Artilharia.")
                else:
                    st.warning("Selecione o marcador para registrar o gol.")

# --- 3. ARTILHARIA E PRESENÇA ---
elif choice == "🏆 Artilharia e Presença":
    st.subheader("🏆 Rankings Oficiais")
    # Mesma lógica anterior de somar gols e contar rodadas...
    pass

# --- 6. CONFIG ---
elif choice == "⚙️ CONFIG":
    st.subheader("Configurações do App")
    nome_atleta = st.text_input("Cadastrar Atleta")
    if st.button("Salvar"):
        conn.execute("INSERT INTO jogadores (nome) VALUES (?)", (nome_atleta,))
        conn.commit()
        st.rerun()
    # (Resto do código de Reset de fábrica...)

conn.close()