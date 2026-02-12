import streamlit as st
from datetime import datetime
import database as db
import engine
import csv
import io

# --- CONFIGURAÇÃO DE IMPACTO SSW ---
st.set_page_config(page_title="EGIDIUS - SSW OFICIAL", layout="wide", page_icon="🛡️")

st.markdown("""
    <style>
    .stApp { background-color: #fdfdfd; }
    .header-ssw {
        background: linear-gradient(135deg, #1b5e20 0%, #2e7d32 100%);
        padding: 3rem; border-radius: 0 0 30px 30px; color: white; text-align: center;
        box-shadow: 0 10px 20px rgba(0,0,0,0.15); margin-bottom: 2rem;
    }
    .historia-box { background: white; padding: 2rem; border-radius: 20px; border-left: 10px solid #ffd700; box-shadow: 0 4px 15px rgba(0,0,0,0.05); }
    .stButton>button { border-radius: 12px; font-weight: bold; border: 2px solid #1b5e20; }
    </style>
    """, unsafe_allow_html=True)

db.create_tables()
conn = db.connect_db()

st.markdown("<div class='header-ssw'><h1>🛡️ EGIDIUS - SÁBADO SHOW</h1><p>Onde o Futebol vira História</p></div>", unsafe_allow_html=True)

menu = ["📖 Nossa História", "📋 Lista de Presença", "⚽ Súmula e Gols", "📊 Rankings e Prêmios", "📥 Exportar Dados", "⚙️ Admin"]
choice = st.sidebar.radio("Navegação Principal", menu)
hoje_str = datetime.now().date().isoformat()

# --- 1. ABA: NOSSA HISTÓRIA (IMPACTO) ---
if choice == "📖 Nossa História":
    st.subheader("📜 A Trajetória do Sábado Show")
    
    col_h1, col_h2 = st.columns([1, 2])
    with col_h1:
        st.image("https://img.icons8.com/color/512/football-ball.png") # Espaço para Logo Oficial
    with col_h2:
        st.markdown("""
        <div class='historia-box'>
            <h3>Os Fundadores</h3>
            <p>O Sábado Show nasceu da união de amigos que acreditam que o futebol é a melhor desculpa para fortalecer laços.</p>
            <p><i>"Mais que uma pelada, uma confraria."</i></p>
        </div>
        """, unsafe_allow_html=True)
    
    st.divider()
    st.write("#### 🎥 Momentos Históricos")
    st.info("Espaço reservado para a integração com os vídeos de gols e comemorações da quadra.")
    # Aqui seu amigo poderá colar links de vídeos do YouTube/Drive da história do time

# --- 2. ABA: RANKINGS E PRÊMIOS (ARTILHARIA) ---
elif choice == "📊 Rankings e Prêmios":
    st.subheader("🏆 Prêmio Chuteira de Ouro 2026")
    ptos, _ = engine.get_rankings()
    
    # Ordenar por Gols para Artilharia
    artilharia = sorted(ptos, key=lambda x: x[3], reverse=True)
    
    cols = st.columns(3)
    for i, p in enumerate(artilharia[:3]):
        with cols[i]:
            st.success(f"{i+1}º Artilheiro: {p[0]}")
            st.metric("Gols Acumulados", f"{p[3]} Gols")

# --- 3. ABA: EXPORTAR (EXCEL/PDF) ---
elif choice == "📥 Exportar Dados":
    st.subheader("💾 Baixar Relatórios Oficiais")
    ptos, _ = engine.get_rankings()
    
    # Exportar para EXCEL (CSV compatível)
    output = io.StringIO()
    writer = csv.writer(output, delimiter=';')
    writer.writerow(["RANK", "ATLETA", "PONTOS", "PARTIDAS", "GOLS"])
    for i, p in enumerate(ptos):
        writer.writerow([i+1, p[0], p[1], p[2], p[3]])
    
    st.download_button(
        label="📥 Baixar Excel (Artilharia e Pontos)",
        data=output.getvalue(),
        file_name=f"SSW_RELATORIO_{datetime.now().year}.csv",
        mime="text/csv"
    )
    
    st.info("A saída em PDF formatada (estilo Súmula) está sendo integrada ao sistema de impressão do navegador (Ctrl+P).")

# --- Mantenha as outras abas conforme as versões anteriores ---
elif choice == "📋 Lista de Presença":
    # (Inserir código de presença com botão de remover aqui)
    pass
elif choice == "⚽ Súmula e Gols":
    # (Inserir código de súmula com campo de vídeo aqui)
    pass
elif choice == "⚙️ Admin":
    # (Inserir código de reset de fábrica e cadastro aqui)
    pass

conn.close()