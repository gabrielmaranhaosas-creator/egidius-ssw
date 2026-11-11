#!/usr/bin/env python3
"""Limpa SOMENTE rodadas/súmulas de testes mediante confirmação e backup. Preserva atletas, fotos e VIAGEM."""
import json, os, sqlite3, subprocess, sys
from pathlib import Path
project=Path(__file__).resolve().parents[1]
if '--executar' not in sys.argv:
    print('MODO PRÉVIA — Não altera dados.'); subprocess.run([sys.executable,str(project/'tools/auditar_base.py')],check=True)
    print('\nPara limpar TODAS as rodadas da base local, pare os serviços e execute:')
    print('python3 tools/limpar_rodadas_teste.py --executar')
    sys.exit(0)
if sys.stdin.isatty() is False:
    raise SystemExit('A exclusão requer confirmação interativa no Terminal. Não use pipe nem script.')
if os.getenv('EGIDIUS_DATABASE_URL') and not os.getenv('EGIDIUS_DATABASE_URL','').startswith('sqlite:///'):
    raise SystemExit('Não modifico banco externo.')
db=Path(os.getenv('EGIDIUS_DATABASE_URL','').removeprefix('sqlite:///') if os.getenv('EGIDIUS_DATABASE_URL') else project/'backend/var/egidius.sqlite3')
if not db.is_file():raise SystemExit('Banco SQLite não encontrado.')
if db.resolve()!= (project/'backend/var/egidius.sqlite3').resolve():
    raise SystemExit('Banco alternativo detectado. Recusando limpeza automática.')
# Evita limpar enquanto servidor está rodando.
if sys.platform=='darwin':
    for port in ('8017','5173','5174'):
        r=subprocess.run(['lsof','-nP',f'-iTCP:{port}','-sTCP:LISTEN'],capture_output=True)
        if r.returncode==0:
            raise SystemExit(f'Serviço ativo na porta {port}. Primeiro pare o EGIDIUS.')
conn=sqlite3.connect(str(db))
row=conn.execute('SELECT revision,payload FROM state WHERE id=1').fetchone()
if row is None:raise SystemExit('Estado esportivo não encontrado.')
data=json.loads(row[1]);n=len(data.get('rodadas',[]))
print(f'EXCLUSÃO SOLICITADA: {n} sábados com partidas, presenças e escalações, e {len(data.get("lixeira", []))} jogos na lixeira.')
print('SERÃO PRESERVADOS: elenco de atletas, perfis, fotografias, viagem, credenciais.')
print('Histórico de revisões esportivas SERÁ LIMPO para não recuperar dados de teste.')
if input('Digite APAGAR RODADAS para continuar: ').strip() != 'APAGAR RODADAS':
    raise SystemExit('Cancelado. Nenhum dado alterado.')
venv=project/'backend/.venv/bin/python'
if not venv.is_file():raise SystemExit('Ambiente virtual ausente; limpeza cancelada.')
subprocess.run([str(venv),str(project/'backend/backup-completo.py')],check=True,cwd=project)
# Backup SQLite consistente adicional, imediatamente antes da transação.
from datetime import datetime
backup_dir=project/'.egidius-backups'/('pre-limpeza-'+datetime.now().strftime('%Y%m%d-%H%M%S'))
backup_dir.mkdir(parents=True,exist_ok=False);backup_dir.chmod(0o700)
backup=backup_dir/'egidius.sqlite3'
with sqlite3.connect(str(backup)) as backupconn:conn.backup(backupconn)
backup.chmod(0o600)
updated={**data,'rodadas':[], 'lixeira':[]}
conn.execute('BEGIN IMMEDIATE')
try:
    conn.execute('UPDATE state SET revision=?,payload=? WHERE id=1',(row[0]+1,json.dumps(updated,ensure_ascii=False)))
    conn.execute('DELETE FROM state_history')
    conn.commit()
except Exception:
    conn.rollback();raise
print('Rodadas de teste removidas. Atletas, viagem e mídias preservados.')
print('Cópia adicional do banco:',backup)
