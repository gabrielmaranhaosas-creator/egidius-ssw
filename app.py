import streamlit as st
from datetime import datetime
import database as db
import csv
import io

# --- DESIGN SYSTEM ESTRATÉGICO ---
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
    .stButton>button {
        border-radius: 12px; height: 55px; font-weight: 700;
        border: 2px solid #155724; color: #155724; background: white;
    }
    .stButton>button:hover { background-color: #155724; color: white; }
    </style>
    """, unsafe_allow_html=True)

db.create_tables()
conn = db.connect_db()

st.markdown("<div class='header-ssw'><h1>EGIDIUS - SSW</h1></div>", unsafe_allow_html=True)

# NOVA ORDEM DAS JANELAS
menu = ["📍 Marcar Presença", "⚽ Gols do Jogo", "🏆 Artilharia e Presença", "📖 Nossa História", "📥 Exportar Dados", "⚙️ CONFIG"]
choice = st.sidebar.radio("MENU", menu)
hoje_str = datetime.now().date().isoformat()

# --- 1. MARCAR PRESENÇA (DIA DE JOGO) ---
if choice == "📍 Marcar Presença":
    st.subheader("📋 Check-in: Ordem de Chegada")
    conn.execute("INSERT OR IGNORE INTO rodadas (data) VALUES (?)", (hoje_str,))
    conn.commit()
    rodada_id = conn.execute("SELECT id FROM rodadas WHERE data=?", (hoje_str,)).fetchone()[0]
    
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

# --- 2. GOLS DO JOGO ---
elif choice == "⚽ Gols do Jogo":
    st.subheader("🎯 Registro de Artilharia")
    cursor = conn.cursor()
    cursor.execute("SELECT j.id, j.nome FROM jogadores j JOIN presencas p ON j.id = p.jogador_id JOIN rodadas r ON r.id = p.rodada_id WHERE r.data=?", (hoje_str,))
    atletas_hoje = cursor.fetchall()
    
    if not atletas_hoje:
        st.info("Aguardando lista de presença para registrar gols.")
    else:
        with st.form("form_gols"):
            atleta = st.selectbox("Quem marcou?", [a[1] for a in atletas_hoje])
            qtd = st.number_input("Quantidade de Gols", 1, 10)
            video = st.text_input("Link do Vídeo (Replay)")
            if st.form_submit_button("SALVAR GOL"):
                j_id = [a[0] for a in atletas_hoje if a[1] == atleta][0]
                conn.execute("INSERT INTO gols (jogador_id, quantidade, link_video, data_registro) VALUES (?,?,?,?)", (j_id, qtd, video, hoje_str))
                conn.commit()
                st.success(f"Gol de {atleta} registrado!")

# --- 3. ARTILHARIA E PRESENÇA ---
elif choice == "🏆 Artilharia e Presença":
    st.subheader("🏆 Melhores da Temporada")
    c1, c2 = st.columns(2)
    with c1:
        st.markdown("### 🎯 Ranking Artilheiro")
        data = conn.execute("SELECT j.nome, SUM(g.quantidade) FROM gols g JOIN jogadores j ON g.jogador_id = j.id GROUP BY j.nome ORDER BY SUM(g.quantidade) DESC").fetchall()
        for i, r in enumerate(data): st.write(f"**{i+1}º** {r[0]} — {r[1]} Gols")
    with c2:
        st.markdown("### 🥇 Prêmio Presença")
        data = conn.execute("SELECT j.nome, COUNT(p.rodada_id) FROM presencas p JOIN jogadores j ON p.jogador_id = j.id GROUP BY j.nome ORDER BY COUNT(p.rodada_id) DESC").fetchall()
        for i, r in enumerate(data): st.write(f"**{i+1}º** {r[0]} — {r[1]} Rodadas")

# --- 6. CONFIG ---
elif choice == "⚙️ CONFIG":
    st.subheader("Painel de Configurações")
    nome = st.text_input("Cadastrar Novo Atleta")
    if st.button("Salvar Atleta"):
        conn.execute("INSERT INTO jogadores (nome) VALUES (?)", (nome,))
        conn.commit()
        st.rerun()
    st.divider()
    if st.button("🚨 RESET TOTAL (Limpar Tudo)"):
        conn.execute("DELETE FROM gols"); conn.execute("DELETE FROM presencas")
        conn.execute("DELETE FROM rodadas"); conn.execute("DELETE FROM jogadores")
        conn.commit(); st.error("Sistema zerado.")

conn.close()