import streamlit as st
from datetime import datetime
import database as db
import engine
import csv

# --- DESIGN SYSTEM SSW ---
st.set_page_config(page_title="EGIDIUS - SSW", layout="wide", page_icon="⚽")

st.markdown("""
    <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&display=swap');
    * { font-family: 'Inter', sans-serif; }
    .stApp { background-color: #fcfdfd; }
    
    /* Header de Alto Impacto */
    .ssw-header {
        background: linear-gradient(135deg, #1b5e20 0%, #2e7d32 100%);
        padding: 3rem; border-radius: 0 0 30px 30px;
        color: white; text-align: center;
        box-shadow: 0 10px 20px rgba(0,0,0,0.1); margin-bottom: 2rem;
    }
    
    /* Cards e Botões */
    .stButton>button {
        border-radius: 12px; height: 50px; font-weight: 700;
        border: 2px solid #1b5e20; background-color: white; color: #1b5e20;
    }
    .stButton>button:hover { background-color: #f1f8e9; border-color: #ffd700; }
    
    /* Tabelas Pro */
    .stMarkdown table { width: 100%; border-radius: 10px; overflow: hidden; }
    th { background-color: #1b5e20 !important; color: white !important; }
    </style>
    """, unsafe_allow_html=True)

db.create_tables()
conn = db.connect_db()

# --- TOPO ---
st.markdown("<div class='ssw-header'><h1>🛡️ EGIDIUS - SSW</h1><p>Gestão Profissional Sábado Show</p></div>", unsafe_allow_html=True)

menu = ["📊 Dashboard", "✅ Lista de Presença", "⏱️ Súmula de Partidas", "🏆 Rankings Oficiais", "⚙️ Configurações"]
choice = st.sidebar.radio("Navegação Principal", menu)

hoje_str = datetime.now().date().isoformat()

# --- 1. DASHBOARD ---
if choice == "📊 Dashboard":
    st.subheader("Resumo da Temporada")
    ptos, _ = engine.get_rankings()
    if ptos:
        c1, c2, c3 = st.columns(3)
        c1.metric("⭐ Top Pontuador", ptos[0][0], f"{ptos[0][1]} pts")
        art = sorted(ptos, key=lambda x: x[3], reverse=True)
        c2.metric("🎯 Artilheiro", art[0][0], f"{art[0][3]} gols")
        c3.metric("👥 Atletas Ativos", len(ptos))
    else:
        st.info("O sistema está pronto para uso. Comece cadastrando os atletas nas Configurações.")

# --- 2. LISTA DE PRESENÇA (COM GESTÃO REAL) ---
elif choice == "✅ Lista de Presença":
    st.subheader("📍 Controle de Entrada")
    conn.execute("INSERT OR IGNORE INTO rodadas (data) VALUES (?)", (hoje_str,))
    conn.commit()
    rodada_id = conn.execute("SELECT id FROM rodadas WHERE data=?", (hoje_str,)).fetchone()[0]
    
    # Busca quem já chegou
    cursor = conn.cursor()
    cursor.execute("SELECT p.id, j.nome, p.ordem FROM presencas p JOIN jogadores j ON p.jogador_id = j.id WHERE p.rodada_id=?", (rodada_id,))
    presentes = cursor.fetchall()
    presentes_nomes = [p[1] for p in presentes]

    t_add, t_manage = st.tabs(["Dar Presença", "Gerenciar/Remover"])
    
    with t_add:
        st.write("Selecione quem chegou:")
        cursor.execute("SELECT id, nome FROM jogadores ORDER BY nome")
        todos = cursor.fetchall()
        cols = st.columns(4)
        for i, (j_id, j_nome) in enumerate(todos):
            if j_nome not in presentes_nomes:
                if cols[i % 4].button(f"➕ {j_nome}", key=f"add_{j_id}", use_container_width=True):
                    ordem = len(presentes) + 1
                    conn.execute("INSERT INTO presencas (rodada_id, jogador_id, ordem, madrugador) VALUES (?,?,?,?)", (rodada_id, j_id, ordem, (1 if ordem == 1 else 0)))
                    conn.commit()
                    st.rerun()

    with t_manage:
        if not presentes: st.info("Nenhum atleta presente no momento.")
        for p_id_db, p_nome, p_ordem in presentes:
            c_p1, c_p2 = st.columns([0.85, 0.15])
            c_p1.markdown(f"**#{p_ordem}** - {p_nome}")
            if c_p2.button("❌", key=f"del_{p_id_db}"):
                conn.execute("DELETE FROM presencas WHERE id=?", (p_id_db,))
                conn.commit()
                st.rerun()

# --- 3. SÚMULA DE PARTIDAS (MÚLTIPLOS JOGOS) ---
elif choice == "⏱️ Súmula de Partidas":
    st.subheader("⚽ Registro de Partida")
    res = conn.execute("SELECT id FROM rodadas WHERE data=?", (hoje_str,)).fetchone()
    if not res:
        st.warning("Inicie a lista de presença primeiro!")
    else:
        rodada_id = res[0]
        cursor = conn.cursor()
        cursor.execute("SELECT j.id, j.nome FROM jogadores j JOIN presencas p ON j.id = p.jogador_id WHERE p.rodada_id=?", (rodada_id,))
        presentes_lista = cursor.fetchall()
        nomes = [p[1] for p in presentes_lista]
        id_map = {p[1]: p[0] for p in presentes_lista}

        with st.form("sumula_pro"):
            st.write("#### 📝 Detalhes do Jogo")
            c1, c2 = st.columns(2)
            juiz = c1.selectbox("👮 Juiz", [""] + nomes)
            mesario = c2.selectbox("📝 Mesário", [""] + nomes)
            
            st.divider()
            col_a, col_b = st.columns(2)
            with col_a:
                st.success("TIME BRANCO")
                t_a = st.multiselect("Jogadores", nomes, key="t_a")
                gk_a = st.selectbox("Goleiro", [""] + t_a, key="gk_a")
                gols_a = st.number_input("Placar Branco", 0, 20)
            with col_b:
                st.warning("TIME COLORIDO")
                t_b = st.multiselect("Jogadores", nomes, key="t_b")
                gk_b = st.selectbox("Goleiro", [""] + t_b, key="gk_b")
                gols_b = st.number_input("Placar Colorido", 0, 20)
            
            link_v = st.text_input("🔗 Link do Vídeo (Replay)")

            if st.form_submit_button("FINALIZAR E SALVAR SÚMULA"):
                cursor.execute("INSERT INTO partidas (rodada_id, gols_a, gols_b, juiz_id, mesario_id) VALUES (?,?,?,?,?)", (rodada_id, gols_a, gols_b, id_map.get(juiz), id_map.get(mesario)))
                pid = cursor.lastrowid
                for n in t_a: conn.execute("INSERT INTO participacoes (partida_id, jogador_id, time, eh_goleiro) VALUES (?,?,?,?)", (pid, id_map[n], 'A', (1 if n == gk_a else 0)))
                for n in t_b: conn.execute("INSERT INTO participacoes (partida_id, jogador_id, time, eh_goleiro) VALUES (?,?,?,?)", (pid, id_map[n], 'B', (1 if n == gk_b else 0)))
                conn.commit()
                st.success("Partida gravada e pontos computados!")

# --- 5. CONFIGURAÇÕES (MODO ADMIN) ---
elif choice == "⚙️ Configurações":
    st.subheader("Painel de Administração")
    
    with st.expander("👥 Gerenciar Banco de Atletas"):
        novo = st.text_input("Nome do Novo Atleta")
        if st.button("Salvar Cadastro"):
            conn.execute("INSERT INTO jogadores (nome) VALUES (?)", (novo,))
            conn.commit()
            st.rerun()

    st.divider()
    st.error("### 🚨 ZONA DE PERIGO")
    st.write("Use as opções abaixo para preparar o sistema para entrega:")
    
    if st.button("LIMPAR TESTES (Apagar Jogos e Presenças)"):
        conn.execute("DELETE FROM participacoes"); conn.execute("DELETE FROM partidas")
        conn.execute("DELETE FROM presencas"); conn.execute("DELETE FROM rodadas")
        conn.commit(); st.success("Sistema limpo para a próxima rodada!")

    if st.button("RESET DE FÁBRICA (Apagar Tudo)"):
        conn.execute("DELETE FROM participacoes"); conn.execute("DELETE FROM partidas")
        conn.execute("DELETE FROM presencas"); conn.execute("DELETE FROM rodadas")
        conn.execute("DELETE FROM jogadores")
        conn.commit(); st.error("Sistema totalmente zerado!")

conn.close()