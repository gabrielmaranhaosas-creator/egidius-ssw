#!/usr/bin/env python3
"""Inventário SOMENTE LEITURA da base local EGIDIUS (sem dados pessoais)."""
import json, os, sqlite3, sys
from pathlib import Path

project=Path(__file__).resolve().parents[1]
db_env=os.getenv('EGIDIUS_DATABASE_URL','')
if db_env and not db_env.startswith('sqlite:///'):
    raise SystemExit('Banco externo configurado. Esta ferramenta somente inspeciona SQLite local.')
db=Path(db_env.removeprefix('sqlite:///') if db_env else project/'backend/var/egidius.sqlite3')
if not db.is_file():raise SystemExit(f'Nenhum banco encontrado: {db}')
conn=sqlite3.connect(f'file:{db}?mode=ro',uri=True)
conn.row_factory=sqlite3.Row
print('EGIDIUS — INVENTÁRIO DE DADOS — NENHUMA ALTERAÇÃO')
print('Banco:',db)
tables={r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
for name in ['users','athlete_profiles','media_files','media_assets','state_history','viagem_ssw_state']:
    if name in tables: print(f'{name}: {conn.execute("SELECT count(*) FROM " + name).fetchone()[0]} registros')
if 'state' in tables:
    row=conn.execute('SELECT revision,payload FROM state WHERE id=1').fetchone()
    if row:
        d=json.loads(row['payload'])
        print('Revisão:',row['revision'],'| Atletas:',len(d.get('jogadores',[])),'| Sábados:',len(d.get('rodadas',[])))
        for r in d.get('rodadas',[]):
            print(' Sábado',r.get('data','?'),'— presenças',len(r.get('presencas',[])),'— times',len(r.get('equipes',[])),'— jogos',len(r.get('jogos',[])))
if 'viagem_ssw_state' in tables:
    row=conn.execute('SELECT payload FROM viagem_ssw_state WHERE id=1').fetchone()
    if row:
        d=json.loads(row[0]); print('Viagem Goiânia: pessoas',len(d.get('pessoas',[])),'| Escalações',len(d.get('timeA',{}).get('atletas',[])),'+',len(d.get('timeB',{}).get('atletas',[])))
print('Nenhum registro foi excluído.')
