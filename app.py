import streamlit as st
from datetime import datetime
import database as db
import engine
import csv
import io

# --- CONFIGURAÇÃO DE ALTO IMPACTO ---
st.set_page_config(page_title="EGIDIUS - SSW", layout="wide", page_icon="🛡️")

st.markdown("""
    <style>
    .stApp { background-color: #fdfdfd; }
    .header-ssw {
        background: linear-gradient(135deg, #1b5e20 0%, #2e7d32 100%);
        padding: 2rem; border-radius: 0 0 20px 20px; color: white; text-align: center;
        box-shadow: 0 5px 15px rgba(0,0,0,0.1); margin-bottom: 2rem;
    }
    .stButton>button { border-radius: 10px; font-weight: bold; border: 2px solid #1b5e20; }
    .stTabs [data-baseweb="tab-list"] { gap: 10px; }
    </style>
    """, unsafe_allow_html=True)

db.create_tables()
conn = db.connect_db()

st.markdown("<div class='header-ssw'><h1>🛡️ EGIDIUS - SÁBADO SHOW</h1></div>", unsafe_allow_html=True)

menu = ["📖 Nossa História", "📋 Lista de Presença", "⚽ Súmula e Gols", "🏆 Rankings e Prêmios", "📥 Exportar Dados", "⚙️ Admin"]
choice = st.sidebar.radio("Navegação Principal", menu)
hoje_str = datetime.now().date().isoformat()

# --- 1. ABA: NOSSA HISTÓRIA (LIMPA) ---
if choice == "📖 Nossa História":
    st.subheader("📜 Galeria e Memória SSW")
    st.info("Espaço destinado à história dos fundadores, fotos e vídeos memoráveis.")
    # Aba deixada vazia conforme solicitado para preenchimento manual posterior.

# --- 2. ABA: LISTA DE PRESENÇA (COM GESTÃO) ---
elif choice == "📋 Lista de Presença":
    st.subheader("📍 Controle de Entrada")
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

    c_in, c_out = st.columns(2)
    with c_in:
        st.write("#### Dar Presença")
        for j_id, j_nome in todos:
            if j_nome not in pres_nomes:
                if st.button(f"➕ {j_nome}", key=f"in_{j_id}", use_container_width=True):
                    ordem = len(presentes) + 1
                    conn.execute("INSERT INTO presencas (rodada_id, jogador_id, ordem, madrugador) VALUES (?,?,?,?)", (rodada_id, j_id, ordem, (1 if ordem == 1 else 0)))
                    conn.commit()
                    st.rerun()
    with c_out:
        st.write("#### Remover (Erro)")
        for p_id, p_nome, p_ord in presentes:
            if st.button(f"❌ {p_nome} (#{p_ord})", key=f"out_{p_id}", use_container_width=True):
                conn.execute("DELETE FROM presencas WHERE id=?", (p_id,))
                conn.commit()
                st.rerun()

# --- 3. ABA: SÚMULA E GOLS (COM VÍDEO) ---
elif choice == "⚽ Súmula e Gols":
    st.subheader("⏱️ Registro da Partida")
    cursor = conn.cursor()
    cursor.execute("SELECT j.id, j.nome FROM jogadores j JOIN presencas p ON j.id = p.jogador_id JOIN rodadas r ON r.id = p.rodada_id WHERE r.data=?", (hoje_str,))
    presentes_hoje = cursor.fetchall()
    nomes = [n[1] for n in presentes_hoje]
    id_map = {n[1]: n[0] for n in presentes_hoje}

    if not nomes:
        st.warning("Aguardando lista de presença...")
    else:
        with st.form("sumula_digital"):
            c1, c2 = st.columns(2)
            t_a = c1.multiselect("Time Branco", nomes)
            t_b = c2.multiselect("Time Colorido", nomes)
            g_a = c1.number_input("Gols Branco", 0)
            g_b = c2.number_input("Gols Colorido", 0)
            v_link = st.text_input("Link do Vídeo do Jogo")
            
            if st.form_submit_button("GRAVAR JOGO"):
                cursor.execute("INSERT INTO partidas (rodada_id, gols_a, gols_b) VALUES ((SELECT id FROM rodadas WHERE data=?), ?, ?)", (hoje_str, g_a, g_b))
                pid = cursor.lastrowid
                for n in t_a: conn.execute("INSERT INTO participacoes (partida_id, jogador_id, time) VALUES (?,?,?)", (pid, id_map[n], 'A'))
                for n in t_b: conn.execute("INSERT INTO participacoes (partida_id, jogador_id, time) VALUES (?,?,?)", (pid, id_map[n], 'B'))
                conn.commit()
                st.success("Jogo registrado!")

# --- 4. ABA: RANKINGS E PRÊMIOS (ARTILHARIA ACUMULADA) ---
elif choice == "🏆 Rankings e Prêmios":
    st.subheader("🏆 Melhores do Ano")
    ptos, _ = engine.get_rankings()
    
    t1, t2 = st.tabs(["🔥 Pontuadores", "🎯 Artilharia (Chuteira de Ouro)"])
    with t1:
        md = "| Nome | Pontos | Partidas |\n| :--- | :--- | :--- |\n"
        for p in ptos: md += f"| {p[0]} | **{p[1]}** | {p[2]} |\n"
        st.markdown(md if ptos else "Sem dados.")
    with t2:
        art = sorted(ptos, key=lambda x: x[3], reverse=True)
        md_a = "| Nome | Gols Total | Média |\n| :--- | :--- | :--- |\n"
        for a in art: 
            media = round(a[3]/a[2], 2) if a[2] > 0 else 0
            md_a += f"| {a[0]} | **{a[3]}** | {media} |\n"
        st.markdown(md_a if art else "Sem dados.")

# --- 5. ABA: EXPORTAR DADOS ---
elif choice == "📥 Exportar Dados":
    st.subheader("💾 Backup e Download")
    ptos, _ = engine.get_rankings()
    
    csv_data = io.StringIO()
    writer = csv.writer(csv_data, delimiter=';')
    writer.writerow(["ATLETA", "PONTOS", "JOGOS", "GOLS"])
    for p in ptos: writer.writerow([p[0], p[1], p[2], p[3]])
    
    st.download_button("📥 Baixar Excel (Pontos e Artilharia)", csv_data.getvalue(), f"SSW_{datetime.now().year}.csv", "text/csv")
    st.info("Para salvar as tabelas em PDF, utilize o atalho Ctrl+P do seu navegador.")

# --- 6. ABA: ADMIN ---
elif choice == "⚙️ Admin":
    st.subheader("Configurações")
    novo = st.text_input("Novo Atleta")
    if st.button("Salvar"):
        conn.execute("INSERT INTO jogadores (nome) VALUES (?)", (novo,))
        conn.commit()
        st.rerun()
    st.divider()
    if st.button("⚠️ RESET TOTAL (Zerar para o Amigo)"):
        conn.execute("DELETE FROM participacoes"); conn.execute("DELETE FROM partidas")
        conn.execute("DELETE FROM presencas"); conn.execute("DELETE FROM rodadas")
        conn.execute("DELETE FROM jogadores"); conn.commit()
        st.error("Sistema Limpo!")

conn.close()