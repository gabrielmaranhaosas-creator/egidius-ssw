import streamlit as st
from datetime import datetime
import pandas as pd
import database as db
import engine
import io

# --- CONFIGURAÇÃO E DESIGN ---
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

# ORDEM DAS JANELAS
menu = ["📍 Marcar Presença", "🎮 Súmula do Jogo", "🏆 Artilharia e Presença", "📖 Nossa História", "📥 Exportar Dados", "⚙️ CONFIG"]
choice = st.sidebar.radio("MENU", menu)
hoje_str = datetime.now().date().isoformat()

# --- 1. MARCAR PRESENÇA ---
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

# --- 2. SÚMULA DO JOGO ---
elif choice == "🎮 Súmula do Jogo":
    st.subheader("⚽ Registro de Gols da Rodada")
    cursor = conn.cursor()
    cursor.execute("SELECT j.id, j.nome FROM jogadores j JOIN presencas p ON j.id = p.jogador_id JOIN rodadas r ON r.id = p.rodada_id WHERE r.data=?", (hoje_str,))
    atletas_hoje = cursor.fetchall()
    
    if not atletas_hoje:
        st.info("Aguardando lista de presença.")
    else:
        with st.form("form_gols"):
            atleta = st.selectbox("Quem marcou?", [a[1] for a in atletas_hoje])
            qtd = st.number_input("Quantidade de Gols", 1, 10)
            video = st.text_input("Link do Vídeo")
            if st.form_submit_button("SALVAR GOL"):
                j_id = [a[0] for a in atletas_hoje if a[1] == atleta][0]
                conn.execute("INSERT INTO gols (jogador_id, quantidade, link_video, data_registro) VALUES (?,?,?,?)", (j_id, qtd, video, hoje_str))
                conn.commit()
                st.success(f"Golo de {atleta} registado!")

# --- 3. ARTILHARIA E PRESENÇA ---
elif choice == "🏆 Artilharia e Presença":
    st.subheader("🏆 Melhores da Temporada")
    pres, art = engine.get_rankings()
    c1, c2 = st.columns(2)
    with c1:
        st.markdown("### 🎯 Artilheiros")
        for i, r in enumerate(art): st.write(f"**{i+1}º** {r[0]} — {r[1] if r[1] else 0} Gols")
    with c2:
        st.markdown("### 🥇 Presenças")
        for i, r in enumerate(pres): st.write(f"**{i+1}º** {r[0]} — {r[1]} Rodadas")

# --- 4. NOSSA HISTÓRIA ---
elif choice == "📖 Nossa História":
    st.subheader("📜 Galeria e Memória SSW")
    st.info("Espaço destinado à história dos fundadores, fotos e vídeos memoráveis.")

# --- 5. EXPORTAR DADOS (CORRIGIDO) ---
elif choice == "📥 Exportar Dados":
    st.subheader("💾 Exportar para Excel")
    if st.button("Gerar Relatório Excel"):
        try:
            df_gols = pd.read_sql_query("SELECT j.nome, SUM(g.quantidade) as Gols FROM gols g JOIN jogadores j ON g.jogador_id = j.id GROUP BY j.nome", conn)
            df_pres = pd.read_sql_query("SELECT j.nome, COUNT(p.rodada_id) as Presencas FROM presencas p JOIN jogadores j ON p.jogador_id = j.id GROUP BY j.nome", conn)
            
            output = io.BytesIO()
            with pd.ExcelWriter(output, engine='openpyxl') as writer:
                df_gols.to_excel(writer, sheet_name='Artilharia', index=False)
                df_pres.to_excel(writer, sheet_name='Presencas', index=False)
            
            st.download_button(
                label="📥 Baixar Relatório Completo",
                data=output.getvalue(),
                file_name=f"SSW_Relatorio_{datetime.now().strftime('%Y')}.xlsx",
                mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            )
        except Exception as e:
            st.error(f"Erro ao exportar: {e}")

# --- 6. CONFIG ---
elif choice == "⚙️ CONFIG":
    st.subheader("Configurações")
    nome = st.text_input("Cadastrar Novo Atleta")
    if st.button("Salvar"):
        conn.execute("INSERT OR IGNORE INTO jogadores (nome) VALUES (?)", (nome,))
        conn.commit()
        st.rerun()
    st.divider()
    if st.button("🚨 RESET TOTAL"):
        conn.execute("DELETE FROM gols"); conn.execute("DELETE FROM presencas")
        conn.execute("DELETE FROM rodadas"); conn.execute("DELETE FROM jogadores")
        conn.commit(); st.error("Dados apagados.")

conn.close()