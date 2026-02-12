import streamlit as st
from datetime import datetime
import database as db
import engine
import csv

# --- SETUP VISUAL SSW ---
st.set_page_config(page_title="EGIDIUS - SSW", layout="wide", page_icon="⚽")

st.markdown("""
    <style>
    /* Estilo Profissional Clean */
    .stApp { background-color: #fcfdfd; }
    .main-header {
        background-color: #1b5e20;
        padding: 2rem;
        border-radius: 15px;
        color: white;
        text-align: center;
        margin-bottom: 2rem;
        box-shadow: 0 4px 10px rgba(0,0,0,0.1);
    }
    /* Cards de Jogador */
    .stButton>button {
        border-radius: 12px; height: 3.5rem; font-weight: 700;
        border: 2px solid #1b5e20; background-color: white; color: #1b5e20;
    }
    .stButton>button:hover { background-color: #f1f8e9; border-color: #ffd700; }
    
    /* Tabelas e Abas */
    .stTabs [data-baseweb="tab-list"] { gap: 10px; }
    .stTabs [data-baseweb="tab"] { background-color: #fff; border: 1px solid #ddd; border-radius: 5px; padding: 10px; }
    </style>
    """, unsafe_allow_html=True)

db.create_tables()
conn = db.connect_db()

# --- TOPO FIXO ---
st.markdown("<div class='main-header'><h1>🛡️ EGIDIUS - SSW</h1><p>Gestão Profissional Sábado Show</p></div>", unsafe_allow_html=True)

menu = ["🏠 Início", "📋 Lista de Presença", "⚽ Súmula de Jogos", "📊 Estatísticas/Ranking", "⚙️ Configurações"]
choice = st.sidebar.radio("Navegação Principal", menu)

hoje_str = datetime.now().date().isoformat()

# --- 1. INÍCIO (DASHBOARD) ---
if choice == "🏠 Início":
    st.subheader("Dashboard da Temporada")
    ptos, _ = engine.get_rankings()
    if ptos:
        c1, c2, c3 = st.columns(3)
        with c1: st.metric("Top Pontuador", ptos[0][0], f"{ptos[0][1]} Pts")
        with c2: 
            art = sorted(ptos, key=lambda x: x[3], reverse=True)
            st.metric("Artilheiro", art[0][0], f"{art[0][3]} Gols")
        with c3: st.metric("Atletas Ativos", len(ptos))
    else:
        st.info("O sistema está pronto. Comece registrando atletas nas Configurações.")

# --- 2. LISTA DE PRESENÇA (COM GESTÃO) ---
elif choice == "📋 Lista de Presença":
    st.subheader("Entrada de Atletas")
    conn.execute("INSERT OR IGNORE INTO rodadas (data) VALUES (?)", (hoje_str,))
    conn.commit()
    rodada_id = conn.execute("SELECT id FROM rodadas WHERE data=?", (hoje_str,)).fetchone()[0]
    
    # Gerenciamento de Presença
    cursor = conn.cursor()
    cursor.execute("SELECT j.id, j.nome FROM jogadores j ORDER BY nome")
    todos = cursor.fetchall()
    
    cursor.execute("SELECT p.id, j.nome, p.ordem FROM presencas p JOIN jogadores j ON p.jogador_id = j.id WHERE p.rodada_id=?", (rodada_id,))
    presentes = cursor.fetchall()
    presentes_nomes = [p[1] for p in presentes]

    t1, t2 = st.tabs(["Dar Presença", "Gerenciar/Remover"])
    
    with t1:
        st.write("Clique no nome para marcar a chegada:")
        cols = st.columns(4)
        for i, (j_id, j_nome) in enumerate(todos):
            if j_nome not in presentes_nomes:
                if cols[i % 4].button(f"➕ {j_nome}", key=f"add_{j_id}", use_container_width=True):
                    ordem = len(presentes) + 1
                    conn.execute("INSERT INTO presencas (rodada_id, jogador_id, ordem, madrugador) VALUES (?,?,?,?)", 
                                 (rodada_id, j_id, ordem, (1 if ordem == 1 else 0)))
                    conn.commit()
                    st.rerun()

    with t2:
        if not presentes: st.write("Ninguém chegou ainda.")
        for p_id_db, p_nome, p_ordem in presentes:
            c_p1, c_p2 = st.columns([0.8, 0.2])
            c_p1.info(f"#{p_ordem} - {p_nome}")
            if c_p2.button("❌", key=f"del_{p_id_db}", help="Remover Presença"):
                conn.execute("DELETE FROM presencas WHERE id=?", (p_id_db,))
                conn.commit()
                st.rerun()

# --- 3. SÚMULA DE JOGOS ---
elif choice == "⚽ Súmula de Jogos":
    st.subheader("Registro de Partida")
    res = conn.execute("SELECT id FROM rodadas WHERE data=?", (hoje_str,)).fetchone()
    if not res:
        st.warning("Primeiro, registre a presença dos atletas.")
    else:
        rodada_id = res[0]
        cursor = conn.cursor()
        cursor.execute("SELECT j.id, j.nome FROM jogadores j JOIN presencas p ON j.id = p.jogador_id WHERE p.rodada_id=?", (rodada_id,))
        p_lista = cursor.fetchall()
        nomes = [n[1] for n in p_lista]
        id_map = {n[1]: n[0] for n in p_lista}

        with st.form("sumula_ssw"):
            col_a, col_b = st.columns(2)
            with col_a:
                st.markdown("#### ⚪ TIME BRANCO")
                t_a = st.multiselect("Jogadores", nomes, key="t_a")
                g_a = st.number_input("Gols Branco", 0, 20)
            with col_b:
                st.markdown("#### 🟢 TIME COLORIDO")
                t_b = st.multiselect("Jogadores", nomes, key="t_b")
                g_b = st.number_input("Gols Colorido", 0, 20)
            
            link_v = st.text_input("URL do Vídeo (Opcional)")
            
            if st.form_submit_button("GRAVAR JOGO"):
                cursor.execute("INSERT INTO partidas (rodada_id, gols_a, gols_b) VALUES (?,?,?)", (rodada_id, g_a, g_b))
                pid = cursor.lastrowid
                for n in t_a: conn.execute("INSERT INTO participacoes (partida_id, jogador_id, time) VALUES (?,?,?)", (pid, id_map[n], 'A'))
                for n in t_b: conn.execute("INSERT INTO participacoes (partida_id, jogador_id, time) VALUES (?,?,?)", (pid, id_map[n], 'B'))
                conn.commit()
                st.success("Jogo Gravado com Sucesso!")

# --- 5. CONFIGURAÇÕES (MODO ADMIN) ---
elif choice == "⚙️ Configurações":
    st.subheader("Painel de Administração")
    
    with st.expander("👥 Gerenciar Banco de Atletas"):
        novo_atleta = st.text_input("Nome do Novo Atleta")
        if st.button("Cadastrar"):
            conn.execute("INSERT INTO jogadores (nome) VALUES (?)", (novo_atleta,))
            conn.commit()
            st.success("Atleta cadastrado!")

    st.divider()
    st.error("### 🚨 ZONA DE PERIGO")
    st.write("Ações para zerar o sistema para seu amigo:")
    
    if st.button("LIMPAR TODOS OS DADOS DE TESTE"):
        conn.execute("DELETE FROM participacoes"); conn.execute("DELETE FROM partidas")
        conn.execute("DELETE FROM presencas"); conn.execute("DELETE FROM rodadas")
        conn.commit()
        st.warning("Dados de jogos e presenças apagados! (Atletas foram mantidos)")

    if st.button("REINICIAR TUDO (Reset de Fábrica)"):
        conn.execute("DELETE FROM participacoes"); conn.execute("DELETE FROM partidas")
        conn.execute("DELETE FROM presencas"); conn.execute("DELETE FROM rodadas")
        conn.execute("DELETE FROM jogadores")
        conn.commit()
        st.error("O sistema está totalmente vazio e pronto para entrega!")

conn.close()