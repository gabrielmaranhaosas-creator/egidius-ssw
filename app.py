import streamlit as st
from datetime import datetime
import database as db
import engine
import csv

# --- DESIGN PROFISSIONAL SSW ---
st.set_page_config(page_title="EGIDIUS - SSW", layout="wide", page_icon="⚽")

st.markdown("""
    <style>
    .stApp { background-color: #fcfdfd; }
    .header-ssw {
        background-color: #1b5e20; color: white; padding: 2rem;
        border-radius: 0 0 20px 20px; text-align: center; margin-bottom: 2rem;
    }
    .stButton>button {
        border-radius: 10px; height: 50px; font-weight: bold;
        border: 2px solid #1b5e20; background-color: white; color: #1b5e20;
    }
    .stButton>button:hover { background-color: #e8f5e9; border-color: #ffd700; }
    h2, h3 { color: #1b5e20; border-bottom: 2px solid #ffd700; padding-bottom: 10px; }
    </style>
    """, unsafe_allow_html=True)

db.create_tables()
conn = db.connect_db()

st.markdown("<div class='header-ssw'><h1>🛡️ EGIDIUS - SSW</h1><p>Gestão Profissional de Partidas</p></div>", unsafe_allow_html=True)

menu = ["🏠 Início", "📋 Lista de Presença", "⚽ Súmula de Jogos", "📊 Rankings", "⚙️ Configurações"]
choice = st.sidebar.radio("Navegação", menu)
hoje_str = datetime.now().date().isoformat()

# --- ABA: PRESENÇA ---
if choice == "📋 Lista de Presença":
    st.subheader("📍 Presença e Ordem de Chegada")
    conn.execute("INSERT OR IGNORE INTO rodadas (data) VALUES (?)", (hoje_str,))
    conn.commit()
    rodada_id = conn.execute("SELECT id FROM rodadas WHERE data=?", (hoje_str,)).fetchone()[0]
    
    cursor = conn.cursor()
    cursor.execute("SELECT j.id, j.nome FROM jogadores j ORDER BY nome")
    todos = cursor.fetchall()
    cursor.execute("SELECT p.id, j.nome, p.ordem FROM presencas p JOIN jogadores j ON p.jogador_id = j.id WHERE p.rodada_id=?", (rodada_id,))
    presentes = cursor.fetchall()
    pres_nomes = [p[1] for p in presentes]

    col_add, col_del = st.columns(2)
    with col_add:
        st.write("#### Dar Presença")
        for j_id, j_nome in todos:
            if j_nome not in pres_nomes:
                if st.button(f"➕ {j_nome}", key=f"in_{j_id}"):
                    ordem = len(presentes) + 1
                    conn.execute("INSERT INTO presencas (rodada_id, jogador_id, ordem, madrugador) VALUES (?,?,?,?)", (rodada_id, j_id, ordem, (1 if ordem == 1 else 0)))
                    conn.commit()
                    st.rerun()
    with col_del:
        st.write("#### Gerenciar/Remover")
        for p_id, p_nome, p_ord in presentes:
            if st.button(f"❌ {p_nome} (#{p_ord})", key=f"out_{p_id}"):
                conn.execute("DELETE FROM presencas WHERE id=?", (p_id,))
                conn.commit()
                st.rerun()

# --- ABA: SÚMULA (Múltiplos Jogos) ---
elif choice == "⚽ Súmula de Jogos":
    st.subheader("⏱️ Registro de Partidas")
    cursor = conn.cursor()
    cursor.execute("SELECT j.id, j.nome FROM jogadores j JOIN presencas p ON j.id = p.jogador_id JOIN rodadas r ON r.id = p.rodada_id WHERE r.data=?", (hoje_str,))
    p_lista = cursor.fetchall()
    nomes = [n[1] for n in p_lista]
    id_map = {n[1]: n[0] for n in p_lista}

    if not nomes:
        st.info("Registre a presença primeiro.")
    else:
        with st.form("jogo_ssw"):
            now = datetime.now().strftime("%H:%M")
            st.write(f"**Data:** {datetime.now().strftime('%d/%m/%Y')} | **Hora:** {now}")
            ca, cb = st.columns(2)
            t_a = ca.multiselect("Time Branco", nomes)
            t_b = cb.multiselect("Time Colorido", nomes)
            ga = ca.number_input("Gols A", 0)
            gb = cb.number_input("Gols B", 0)
            v_url = st.text_input("Link do Vídeo")
            if st.form_submit_button("GRAVAR JOGO"):
                # Salva o jogo com data e hora
                cursor.execute("INSERT INTO partidas (rodada_id, data_hora, gols_a, gols_b) VALUES ((SELECT id FROM rodadas WHERE data=?), ?, ?, ?)", (hoje_str, now, ga, gb))
                pid = cursor.lastrowid
                for n in t_a: conn.execute("INSERT INTO participacoes (partida_id, jogador_id, time, link_video) VALUES (?,?,?,?)", (pid, id_map[n], 'A', v_url))
                for n in t_b: conn.execute("INSERT INTO participacoes (partida_id, jogador_id, time, link_video) VALUES (?,?,?,?)", (pid, id_map[n], 'B', v_url))
                conn.commit()
                st.success("Jogo e vídeo registrados!")

# --- ABA: RANKING ---
elif choice == "📊 Rankings":
    ptos, _ = engine.get_rankings()
    st.subheader("🏆 Melhores do Ano")
    header = "| Nome | Ptos | Jogos | Gols |\n| :--- | :--- | :--- | :--- |"
    rows = [f"| {p[0]} | **{p[1]}** | {p[2]} | {p[3]} |" for p in ptos]
    st.markdown(header + "\n" + "\n".join(rows) if rows else "Sem dados.")

# --- ABA: CONFIGURAÇÕES ---
elif choice == "⚙️ Configurações":
    st.subheader("Administração")
    novo = st.text_input("Nome Atleta")
    if st.button("Cadastrar"):
        conn.execute("INSERT INTO jogadores (nome) VALUES (?)", (novo,))
        conn.commit()
        st.success("Cadastrado!")
    st.divider()
    if st.button("⚠️ RESET DE FÁBRICA (Zerar Tudo)"):
        conn.execute("DELETE FROM participacoes"); conn.execute("DELETE FROM partidas")
        conn.execute("DELETE FROM presencas"); conn.execute("DELETE FROM rodadas")
        conn.execute("DELETE FROM jogadores"); conn.commit()
        st.error("Sistema Zerado!")

conn.close()