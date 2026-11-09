"""Validação estrutural de backups SQLite, sem importar ou iniciar a aplicação."""
import json
from pathlib import Path
import sqlite3

REQUIRED = {
    'users': {'username','password_hash'},
    'sessions': {'token_hash','username','csrf_token','expires_at'},
    'state': {'id','revision','payload','updated_at'},
    'state_history': {'id','revision','actor','payload','created_at'},
    'athlete_profiles': {'athlete_id','revision','payload','sticker_number','updated_at'},
    'media_assets': {'id','scope','kind','athlete_id','round_id','match_id','caption','original_name','stored_name','mime_type','size','actor','created_at'},
    'viagem_ssw_state': {'id','revision','payload'},
}


def validar_banco(path):
    con=sqlite3.connect(Path(path).resolve().as_uri()+'?mode=ro',uri=True)
    try:
        if con.execute('PRAGMA integrity_check').fetchone()[0]!='ok':raise ValueError('SQLite inválido.')
        tables={name for name,kind in con.execute('SELECT name,type FROM sqlite_master') if kind=='table'}
        for table, required in REQUIRED.items():
            if table not in tables:raise ValueError('O backup não contém todas as tabelas do EGIDIUS.')
            actual={r[1] for r in con.execute('PRAGMA table_info('+table+')')}
            if not required.issubset(actual):raise ValueError('A estrutura do backup é incompatível: '+table)
        row=con.execute('SELECT revision,payload FROM state WHERE id=1').fetchone()
        if not row or row[0]<0:raise ValueError('Estado principal ausente ou inválido.')
        state=json.loads(row[1])
        if state.get('versao')!=5 or not isinstance(state.get('jogadores'),list) or not isinstance(state.get('rodadas'),list):
            raise ValueError('O backup não contém um estado válido do EGIDIUS.')
        return con.execute('SELECT stored_name,size FROM media_assets').fetchall()
    finally:con.close()
