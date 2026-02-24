import streamlit as st
from datetime import datetime
import pandas as pd
import database as db
import engine
import io

# --- CONFIGURAÇÃO DE DESIGN ESTRATÉGICO ---
st.set_page_config(page_title="EGIDIUS - SSW", layout="wide", page_icon="🛡️")

# Injeção de CSS para Identidade Visual SSW
st.markdown("""
    <style>
    @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;700;900&display=swap');
    
    /* Global */
    * { font-family: 'Montserrat', sans-serif; }
    .stApp { background-color: #FFFFFF; }
    
    /* Header Institucional - Verde, Ouro e Preto */
    .header-ssw {
        background: linear-gradient(135deg, #1A1A1A 0%, #155724 100%);
        padding: 30px;
        border-radius: 0 0 20px 20px;
        color: #FFD700;
        text-align: center;
        border-bottom: 5px solid #CC0000;
        margin-bottom: 30px;
        box-shadow: 0 4px 15px rgba(0,0,0,0.3);
    }
    
    /* Menu Lateral */
    [data-testid="stSidebar"] {
        background-color: #1A1A1A;
        border-right: 3px solid #FFD700;
    }
    [data-testid="stSidebar"] * { color: white !important; }
    
    /* Botões SSW - Estilo "Match Day" */
    .stButton>button {
        border-radius: 8px;
        height: 50px;
        font-weight: 700;
        text-transform: uppercase;
        background-color: #FFFFFF;
        color: #155724;
        border: 2px solid #155724;
        transition: 0.3s;
    }
    .stButton>button:hover {
        background-color: #FFD700;
        color: #1A1A1A;
        border-color: #1A1A1A;
    }
    
    /* Estilo para Rankings */
    .rank-card {
        background: #F8F9FA;
        padding: 15px;
        border-left: 5px solid #FFD700;
        border-radius: 5px;
        margin-bottom: 10px;
    }
    </style>
    """, unsafe_allow_html=True)

db.create_tables()
conn = db.connect_db()

# Banner Principal
st.markdown("<div class='header-ssw'><h1>🛡️ EGIDIUS - SÁBADO SHOW</h1><p>O Banco de Dados Oficial da Confraria</p></div>", unsafe_allow_html=True)

# Menu de Navegação
menu = ["📍 Marcar Presença", "🎮 Súmula do Jogo", "🏆 Artilharia e Presença", "📖 Nossa História", "📥 Exportar Dados", "⚙️ CONFIG"]
choice = st.sidebar.radio("NAVEGAÇÃO", menu)
hoje_str = datetime.now().date().isoformat()

# --- 1. MARCAR PRESENÇA ---
if choice == "📍 Marcar Presença":
    st.subheader("📋 Lista de Presença e Check-in")
    conn.execute("INSERT OR IGNORE INTO rodadas (data) VALUES (?)", (hoje_str,))
    conn.commit()
    rodada_id = conn.execute("SELECT id FROM rodadas WHERE data=?", (hoje_str,)).fetchone()[0]
    
    todos = conn.execute("SELECT id, nome FROM jogadores ORDER BY nome").fetchall()
    presentes = conn.execute("SELECT p.id, j.nome, p.ordem FROM presencas p JOIN jogadores j ON p.jogador_id = j.id WHERE p.rodada_id=? ORDER BY p.ordem", (rodada_id,)).fetchall()
    pres_nomes = [p[1] for p in presentes]

    c1, c2 = st.columns(2)
    with c1:
        st.markdown("#### ✅ Confirmar Presença")
        for j_id, j_nome in todos:
            if j_nome not in pres_nomes:
                if st.button(f"Reg. {j_nome}", key=f"in_{j_id}", use_container_width=True):
                    conn.execute("INSERT INTO presencas (rodada_id, jogador_id, ordem) VALUES (?,?,?)", (rodada_id, j_id, len(presentes)+1))
                    conn.commit()
                    st.rerun()
    with c2:
        st.markdown("#### 🏃 Ordem de Chegada")
        for p_id, p_nome, p_ord in presentes:
            if st.button(f"❌ {p_nome} (#{p_ord})", key=f"out_{p_id}", use_container_width=True):
                conn.execute("DELETE FROM presencas WHERE id=?", (p_id,))
                conn.commit()
                st.rerun()

# --- 2. SÚMULA DO JOGO (TIME X TIME) ---
elif choice == "🎮 Súmula do Jogo":
    st.subheader("⚽ Registro de Partidas e Gols")
    presentes_hoje = conn.execute("SELECT j.id, j.nome FROM jogadores j JOIN presencas p ON j.id = p.jogador_id JOIN rodadas r ON r.id = p.rodada_id WHERE r.data=?", (hoje_str,)).fetchall()
    nomes = [a[1] for a in presentes_hoje]
    id_map = {a[1]: a[0] for a in presentes_hoje}

    if not nomes:
        st.info("Nenhum atleta presente hoje. Marque a presença antes de começar a súmula.")
    else:
        rodada_id = conn.execute("SELECT id FROM rodadas WHERE data=?", (hoje_str,)).fetchone()[0]
        num_jogo = conn.execute("SELECT COUNT(*) FROM partidas WHERE rodada_id=?", (rodada_id,)).fetchone()[0] + 1

        with st.form("sumula"):
            st.markdown(f"### 🏟️ PARTIDA Nº {num_jogo}")
            col_a, col_b = st.columns(2)
            with col_a:
                st.markdown("**⚪ TIME BRANCO**")
                time_a = st.multiselect("Escalação Branco", nomes, key="ta")
                gols_a = st.number_input("Gols do Branco", 0, 20, key="ga")
            with col_b:
                st.markdown("**🟡 TIME COLORIDO**")
                time_b = st.multiselect("Escalação Colorido", nomes, key="tb")
                gols_b = st.number_input("Gols do Colorido", 0, 20, key="gb")
            
            st.divider()
            atleta_gol = st.selectbox("Quem fez o gol?", [""] + nomes)
            qtd_gols = st.number_input("Total de Gols deste Atleta", 1, 10)
            
            if st.form_submit_button("GRAVAR SÚMULA"):
                if time_a and time_b:
                    cursor = conn.cursor()
                    cursor.execute("INSERT INTO partidas (rodada_id, numero_jogo, time_a_gols, time_b_gols) VALUES (?,?,?,?)", (rodada_id, num_jogo, gols_a, gols_b))
                    p_id = cursor.lastrowid
                    
                    for n in time_a:
                        g = qtd_gols if n == atleta_gol else 0
                        conn.execute("INSERT INTO participacoes (partida_id, jogador_id, time, gols) VALUES (?,?,?,?)", (p_id, id_map[n], 'A', g))
                    for n in time_b:
                        g = qtd_gols if n == atleta_gol else 0
                        conn.execute("INSERT INTO participacoes (partida_id, jogador_id, time, gols) VALUES (?,?,?,?)", (p_id, id_map[n], 'B', g))
                    
                    conn.commit()
                    st.success("Partida registrada no histórico!")
                    st.rerun()

# --- 3. RANKINGS ---
elif choice == "🏆 Artilharia e Presença":
    st.subheader("🏆 Rankings Oficiais")
    c1, c2 = st.columns(2)
    with c1:
        st.markdown("### 🎯 Artilheiro")
        data = conn.execute("SELECT j.nome, SUM(p.gols) as t FROM participacoes p JOIN jogadores j ON p.jogador_id = j.id GROUP BY j.nome ORDER BY t DESC").fetchall()
        for i, r in enumerate(data):
            st.markdown(f"<div class='rank-card'><b>{i+1}º {r[0]}</b> — {r[1]} Gols</div>", unsafe_allow_html=True)
    with c2:
        st.markdown("### 🥇 Presença")
        data = conn.execute("SELECT j.nome, COUNT(DISTINCT r.id) FROM presencas p JOIN jogadores j ON p.jogador_id = j.id JOIN rodadas r ON p.rodada_id = r.id GROUP BY j.nome ORDER BY COUNT(r.id) DESC").fetchall()
        for i, r in enumerate(data):
            st.markdown(f"<div class='rank-card'><b>{i+1}º {r[0]}</b> — {r[1]} Rodadas</div>", unsafe_allow_html=True)

# --- 5. EXPORTAR ---
elif choice == "📥 Exportar Dados":
    st.subheader("📥 Exportação para Auditoria")
    if st.button("GERAR EXCEL DA TEMPORADA"):
        df = pd.read_sql_query("SELECT j.nome, SUM(p.gols) as Gols FROM participacoes p JOIN jogadores j ON p.jogador_id = j.id GROUP BY j.nome", conn)
        buffer = io.BytesIO()
        with pd.ExcelWriter(buffer, engine='openpyxl') as writer:
            df.to_excel(writer, index=False)
        st.download_button("Clique para Baixar", buffer.getvalue(), "Egidius_SSW_2026.xlsx")

# --- 6. CONFIG ---
elif choice == "⚙️ CONFIG":
    st.subheader("Configurações do App")
    nome = st.text_input("Nome do Atleta")
    if st.button("Salvar Cadastro"):
        conn.execute("INSERT OR IGNORE INTO jogadores (nome) VALUES (?)", (nome,))
        conn.commit()
        st.rerun()
    if st.button("🚨 RESET TOTAL (LIMPAR TUDO)"):
        conn.execute("DELETE FROM participacoes"); conn.execute("DELETE FROM partidas")
        conn.execute("DELETE FROM presencas"); conn.execute("DELETE FROM rodadas")
        conn.execute("DELETE FROM jogadores"); conn.commit(); st.rerun()

conn.close()