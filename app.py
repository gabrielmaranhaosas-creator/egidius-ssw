import streamlit as st
from datetime import datetime
import pandas as pd
import database as db
import io

# --- DESIGN SYSTEM ---
st.set_page_config(page_title="EGIDIUS - SSW", layout="wide", page_icon="🛡️")

st.markdown("""
    <style>
    @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;700;900&display=swap');
    * { font-family: 'Montserrat', sans-serif; }
    .stApp { background-color: #FFFFFF; }
    .header-ssw {
        background: linear-gradient(135deg, #155724 0%, #1e7e34 100%);
        padding: 30px; border-radius: 0 0 30px 30px;
        color: white; text-align: center; border-bottom: 4px solid #B8860B;
        margin-bottom: 25px;
    }
    .match-box {
        background-color: #f8f9fa; padding: 20px; border-radius: 15px;
        border: 1px solid #e0e0e0; margin-bottom: 20px;
    }
    .stButton>button { border-radius: 10px; font-weight: 700; }
    </style>
    """, unsafe_allow_html=True)

db.create_tables()
conn = db.connect_db()

st.markdown("<div class='header-ssw'><h1>🛡️ EGIDIUS - SSW</h1></div>", unsafe_allow_html=True)

menu = ["📍 Presença", "🎮 Súmula dos Jogos", "🏆 Rankings", "📖 Nossa História", "📥 Exportar", "⚙️ CONFIG"]
choice = st.sidebar.radio("MENU", menu)
hoje_str = datetime.now().date().isoformat()

# --- 1. PRESENÇA ---
if choice == "📍 Presença":
    st.subheader("📋 Ordem de Chegada")
    conn.execute("INSERT OR IGNORE INTO rodadas (data) VALUES (?)", (hoje_str,))
    conn.commit()
    res_r = conn.execute("SELECT id FROM rodadas WHERE data=?", (hoje_str,)).fetchone()
    rodada_id = res_r[0]
    
    cursor = conn.cursor()
    cursor.execute("SELECT id, nome FROM jogadores ORDER BY nome")
    todos = cursor.fetchall()
    cursor.execute("SELECT p.id, j.nome, p.ordem FROM presencas p JOIN jogadores j ON p.jogador_id = j.id WHERE p.rodada_id=? ORDER BY p.ordem", (rodada_id,))
    presentes = cursor.fetchall()
    
    c1, c2 = st.columns(2)
    with c1:
        st.write("#### Registrar Entrada")
        pres_nomes = [p[1] for p in presentes]
        for j_id, j_nome in todos:
            if j_nome not in pres_nomes:
                if st.button(f"➕ {j_nome}", key=f"in_{j_id}", use_container_width=True):
                    conn.execute("INSERT INTO presencas (rodada_id, jogador_id, ordem) VALUES (?,?,?)", (rodada_id, j_id, len(presentes)+1))
                    conn.commit()
                    st.rerun()
    with c2:
        st.write("#### Lista de Hoje")
        for p_id, p_nome, p_ord in presentes:
            if st.button(f"❌ {p_nome} (#{p_ord})", key=f"out_{p_id}", use_container_width=True):
                conn.execute("DELETE FROM presencas WHERE id=?", (p_id,))
                conn.commit()
                st.rerun()

# --- 2. SÚMULA DOS JOGOS (TIME X TIME) ---
elif choice == "🎮 Súmula dos Jogos":
    st.subheader("⚽ Registro de Partidas")
    cursor = conn.cursor()
    cursor.execute("SELECT j.id, j.nome FROM jogadores j JOIN presencas p ON j.id = p.jogador_id JOIN rodadas r ON r.id = p.rodada_id WHERE r.data=?", (hoje_str,))
    atletas_hoje = cursor.fetchall()
    nomes = [a[1] for a in atletas_hoje]
    id_map = {a[1]: a[0] for a in atletas_hoje}

    if not nomes:
        st.warning("Bata o ponto dos jogadores na aba Presença primeiro!")
    else:
        # Verifica quantos jogos já foram registrados hoje
        rodada_id = conn.execute("SELECT id FROM rodadas WHERE data=?", (hoje_str,)).fetchone()[0]
        jogos_existentes = conn.execute("SELECT COUNT(*) FROM partidas WHERE rodada_id=?", (rodada_id,)).fetchone()[0]
        proximo_jogo = jogos_existentes + 1

        with st.form("form_jogo"):
            st.markdown(f"### 🏟️ JOGO Nº {proximo_jogo}")
            col_a, col_b = st.columns(2)
            with col_a:
                st.markdown("**⚪ TIME BRANCO**")
                time_a = st.multiselect("Jogadores Branco", nomes, key="ta")
                gols_a = st.number_input("Gols Branco", 0, 20, key="ga")
            with col_b:
                st.markdown("**🟢 TIME COLORIDO**")
                time_b = st.multiselect("Jogadores Colorido", nomes, key="tb")
                gols_b = st.number_input("Gols Colorido", 0, 20, key="gb")
            
            st.divider()
            st.write("#### 🎯 Artilheiros deste Jogo")
            marcador = st.selectbox("Quem marcou?", [""] + nomes)
            qtd_gols = st.number_input("Quantos gols ele fez neste jogo?", 1, 10)
            video = st.text_input("Link do Replay")

            if st.form_submit_button("FINALIZAR E GRAVAR JOGO"):
                if time_a and time_b:
                    # Cria a partida
                    cursor.execute("INSERT INTO partidas (rodada_id, numero_jogo, time_a_gols, time_b_gols) VALUES (?,?,?,?)", 
                                 (rodada_id, proximo_jogo, gols_a, gols_b))
                    p_id = cursor.lastrowid
                    
                    # Registra quem jogou em cada time
                    for n in time_a:
                        g = qtd_gols if n == marcador else 0
                        v = video if n == marcador else ""
                        conn.execute("INSERT INTO participacoes (partida_id, jogador_id, time, gols, link_video) VALUES (?,?,?,?,?)", (p_id, id_map[n], 'A', g, v))
                    for n in time_b:
                        g = qtd_gols if n == marcador else 0
                        v = video if n == marcador else ""
                        conn.execute("INSERT INTO participacoes (partida_id, jogador_id, time, gols, link_video) VALUES (?,?,?,?,?)", (p_id, id_map[n], 'B', g, v))
                    
                    conn.commit()
                    st.success(f"Jogo {proximo_jogo} gravado no banco de dados!")
                    st.rerun()
                else:
                    st.error("Escala os dois times antes de gravar!")

# --- 3. RANKINGS (ARTILHEIRO E PRESENÇA) ---
elif choice == "🏆 Rankings":
    st.subheader("🏆 Melhores da Temporada")
    col1, col2 = st.columns(2)
    with col1:
        st.markdown("### 🎯 Artilheiro")
        data = conn.execute("SELECT j.nome, SUM(p.gols) as total FROM participacoes p JOIN jogadores j ON p.jogador_id = j.id GROUP BY j.nome ORDER BY total DESC").fetchall()
        for i, r in enumerate(data): st.write(f"**{i+1}º** {r[0]} — {r[1]} Gols")
    with col2:
        st.markdown("### 🥇 Presença")
        data = conn.execute("SELECT j.nome, COUNT(DISTINCT r.id) FROM presencas p JOIN jogadores j ON p.jogador_id = j.id JOIN rodadas r ON p.rodada_id = r.id GROUP BY j.nome ORDER BY COUNT(r.id) DESC").fetchall()
        for i, r in enumerate(data): st.write(f"**{i+1}º** {r[0]} — {r[1]} Sábados")

# --- 5. EXPORTAR ---
elif choice == "📥 Exportar":
    st.subheader("💾 Exportar Banco de Dados")
    if st.button("Gerar Excel"):
        df = pd.read_sql_query("SELECT j.nome, SUM(p.gols) as Gols FROM participacoes p JOIN jogadores j ON p.jogador_id = j.id GROUP BY j.nome", conn)
        output = io.BytesIO()
        with pd.ExcelWriter(output, engine='openpyxl') as writer:
            df.to_excel(writer, sheet_name='Geral', index=False)
        st.download_button("📥 Baixar Excel", output.getvalue(), "Relatorio_SSW.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")

# --- 6. CONFIG ---
elif choice == "⚙️ CONFIG":
    st.subheader("Configurações")
    nome = st.text_input("Novo Atleta")
    if st.button("Salvar"):
        conn.execute("INSERT OR IGNORE INTO jogadores (nome) VALUES (?)", (nome,))
        conn.commit()
        st.rerun()
    if st.button("🚨 RESET TOTAL"):
        conn.execute("DELETE FROM participacoes"); conn.execute("DELETE FROM partidas")
        conn.execute("DELETE FROM presencas"); conn.execute("DELETE FROM rodadas")
        conn.execute("DELETE FROM jogadores"); conn.commit(); st.rerun()

conn.close()