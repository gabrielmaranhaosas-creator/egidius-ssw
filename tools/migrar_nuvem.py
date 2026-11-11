#!/usr/bin/env python3
"""Confere backup e migra para banco/armazenamento novos. Credenciais só no ambiente."""
import argparse
import json
import os
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'backend'))
from egidius_api.portability import unpack_backup, restore_empty
from egidius_api.db import engine_for_url
from egidius_api.storage import get_storage


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('backup', type=Path)
    parser.add_argument('--aplicar', action='store_true')
    args = parser.parse_args()
    os.umask(0o077)
    with unpack_backup(args.backup) as (database, media):
        print('Backup conferido: estrutura, registros e mídia íntegros.')
        if not args.aplicar:
            print('Somente conferência. Nenhuma conexão com o destino foi aberta.')
            return
        url = os.environ.get('EGIDIUS_DATABASE_URL', '')
        if not url.startswith(('postgresql://', 'postgresql+psycopg://')):
            raise ValueError('Configure EGIDIUS_DATABASE_URL com o PostgreSQL de destino.')
        engine = engine_for_url(url)
        try:
            report = restore_empty(database, engine, get_storage(), media)
        finally:
            engine.dispose()
        print(json.dumps(report, ensure_ascii=False))


if __name__ == '__main__':
    try: main()
    except Exception:
        # Não imprima exceções SQL/SDK que possam carregar parâmetros privados.
        raise SystemExit('Migração interrompida. Confira o backup, as credenciais e se o destino está vazio.') from None
