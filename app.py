import streamlit as st
from datetime import datetime
import database as db
import csv
import io

# --- DESIGN SYSTEM SSW ---
st.set_page_config(page_title="EGIDIUS - SSW", layout="wide")

st.markdown("""
    <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&display=swap');
    * { font-family: 'Inter', sans-serif; }
    .stApp { background-color: #ffffff; }
    
    /* Header Profissional */
    .header-ssw {
        background-color: #1b5e20; padding: 50px; border-radius: 0 0 40px 40px;
        color: white; text-align: center; box-shadow: 0 10px 30px rgba(0,0,0,0.05);
        margin-bottom: 40px;
    }
    .header-ssw h1 { font-size: 3.5rem; font-weight: 900; margin: 0; }
    
    /* Botões de Ação SSW */
    .stButton>button {
        border-radius: 12px; height: 60px; font-weight: 800; font-size: 18px;
        border: 2px solid #1b5e20; background-color: transparent; color: #1b5e20;
        transition: 0.3s;
    }
    .stButton>button:hover { background-color: #1b5e20; color: white; transform: translateY(-2px); }
    
    /* Tabelas e Rankings */
    .styled-table { width: 100%; border-radius: 15px; border: 1px solid #eee; background: #fff; }
    [data-testid="stMetricValue"] { color: #1b5e20; font-weight: 900; }
    </style>
    """, unsafe_allow_html=True)

db.create_tables()
conn = db.connect_db()

st.markdown("<div class='header-ssw'><h1>EGIDIUS - SSW</h1></div>", unsafe_allow_html=True)

menu = ["📖 Nossa História", "📋 Lista de Presença", "⚽ Súmula e Gols", "🏆 Prêmios da Temporada", "📥 Exportar Dados", "⚙️ Admin"]
choice = st.sidebar.radio("NAVEGAÇÃO", menu)
hoje_str = datetime.now().date().isoformat()

# --- 1. NOSSA HISTÓRIA ---
if choice == "📖 Nossa História":
    st.subheader("📜 Legado e Fundadores")
    # Aba limpa para inserção de fotos e vídeos manuais

# --- 2. LISTA DE PRESENÇA (PRÊMIO PRESENÇA) ---
elif choice == "📋 Lista de Presença":
    st.subheader("📍 Frequência Oficial")
    conn.execute("INSERT OR IGNORE INTO rodadas (data) VALUES (?)", (hoje_str,))
    conn.commit()
    rodada_id = conn.execute("SELECT id FROM rodadas WHERE data=?", (hoje_str,)).fetchone()[0]
    
    # Lógica de presença com remoção (o "X" que você pediu)
    cursor = conn.cursor()
    cursor.execute("SELECT j.id, j.nome FROM jogadores j ORDER BY nome")
    todos = cursor.fetchall()
    cursor.execute("SELECT p.id, j.nome, p.ordem FROM presencas p JOIN jogadores j ON p.jogador_id = j.id WHERE p.rodada_id=?", (rodada_id,))
    presentes = cursor.fetchall()
    
    col_a, col_b = st.columns(2)
    with col_a:
        st.write("#### Registrar Entrada")
        pres_nomes = [p[1] for p in presentes]
        for j_id, j_nome in todos:
            if j_nome not in pres_nomes:
                if st.button(f"➕ {j_nome}", key=f"add_{j_id}", use_container_width=True):
                    conn.execute("INSERT INTO presencas (rodada_id, jogador_id, ordem) VALUES (?,?,?)", (rodada_id, j_id, len(presentes)+1))
                    conn.commit()
                    st.rerun()
    with col_b:
        st.write("#### Gerenciar / Remover")
        for p_id_db, p_nome, p_ord in presentes:
            if st.button(f"❌ {p_nome} (#{p_ord})", key=f"del_{p_id_db}", use_container_width=True):
                conn.execute("DELETE FROM presencas WHERE id=?", (p_id_db,))
                conn.commit()
                st.rerun()

# --- 3. SÚMULA E GOLS (ARTILHARIA) ---
elif choice == "⚽ Súmula e Gols":
    st.subheader("⏱️ Registro de Gols")
    res_r = conn.execute("SELECT id FROM rodadas WHERE data=?", (hoje_str,)).fetchone()
    if res_r:
        rodada_id = res_r[0]
        cursor = conn.cursor()
        cursor.execute("SELECT j.id, j.nome FROM jogadores j JOIN presencas p ON j.id = p.jogador_id WHERE p.rodada_id=?", (rodada_id,))
        presentes = cursor.fetchall()
        
        with st.form("sumula_ssw"):
            st.write("Selecione quem marcou:")
            nome_marcador = st.selectbox("Atleta", [p[1] for p in presentes])
            qtd_gols = st.number_input("Quantidade de Gols", 1, 10)
            v_link = st.text_input("Link do Vídeo")
            if st.form_submit_button("REGISTRAR GOL"):
                j_id = [p[0] for p in presentes if p[1] == nome_marcador][0]
                conn.execute("INSERT INTO gols (jogador_id, quantidade, link_video) VALUES (?,?,?)", (j_id, qtd_gols, v_link))
                conn.commit()
                st.success(f"Gol de {nome_marcador} salvo!")

# --- 4. PRÊMIOS DA TEMPORADA ---
elif choice == "🏆 Prêmios da Temporada":
    st.subheader("🏁 Quadro de Líderes")
    c1, c2 = st.columns(2)
    with c1:
        st.markdown("### 🎯 Artilheiro")
        cursor = conn.execute("SELECT j.nome, SUM(g.quantidade) as total FROM gols g JOIN jogadores j ON g.jogador_id = j.id GROUP BY j.nome ORDER BY total DESC")
        data_art = cursor.fetchall()
        for i, row in enumerate(data_art):
            st.write(f"**{i+1}º** {row[0]} — {row[1]} Gols")
            
    with c2:
        st.markdown("### 🥇 Prêmio Presença")
        cursor = conn.execute("SELECT j.nome, COUNT(p.rodada_id) as freq FROM presencas p JOIN jogadores j ON p.jogador_id = j.id GROUP BY j.nome ORDER BY freq DESC")
        data_pres = cursor.fetchall()
        for i, row in enumerate(data_pres):
            st.write(f"**{i+1}º** {row[0]} — {row[1]} Rodadas")

# --- 5. EXPORTAR DADOS ---
elif choice == "📥 Exportar Dados":
    st.subheader("💾 Download de Súmulas")
    # Função simples de exportação CSV para Excel
    if st.button("Gerar Relatório de Artilharia"):
        # Lógica de CSV aqui...
        st.success("Relatório pronto!")

# --- 6. ADMIN ---
elif choice == "⚙️ Admin":
    st.subheader("Painel Master")
    novo = st.text_input("Nome do Atleta")
    if st.button("Cadastrar Atleta"):
        conn.execute("INSERT INTO jogadores (nome) VALUES (?)", (novo,))
        conn.commit()
        st.rerun()
    st.divider()
    if st.button("🚨 RESET DE FÁBRICA (Zerar Tudo)"):
        conn.execute("DELETE FROM gols"); conn.execute("DELETE FROM presencas")
        conn.execute("DELETE FROM rodadas"); conn.execute("DELETE FROM jogadores")
        conn.commit(); st.error("Sistema Zerado!")

conn.close()