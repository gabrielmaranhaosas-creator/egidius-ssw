import argparse, getpass, json, os
from pathlib import Path
from datetime import datetime, timezone
from sqlalchemy import select, func
from .db import UserRole, session_factory, User, State
from .security import hash_password

def main():
    parser = argparse.ArgumentParser(description='Administração local do EGIDIUS')
    parser.add_argument('command', choices=['create-admin', 'create-user', 'has-admin', 'backup'])
    parser.add_argument('--username', default='admin')
    parser.add_argument('--role',choices=['viewer','operator','admin'],default='viewer')
    args = parser.parse_args()
    SessionLocal, engine = session_factory()
    try:
        with SessionLocal() as db:
            if args.command == 'backup':
                row = db.get(State, 1)
                out_dir = Path(__file__).resolve().parents[1] / 'backups'
                out_dir.mkdir(parents=True, exist_ok=True)
                file_path=out_dir / f'egidius-rev-{row.revision}-{datetime.now(timezone.utc):%Y%m%d-%H%M%S}.json'
                fd = os.open(file_path, os.O_CREAT | os.O_WRONLY | os.O_EXCL, 0o600)
                with os.fdopen(fd,'w',encoding='utf-8') as f:
                    json.dump({'revision':row.revision,'data':json.loads(row.payload)},f,ensure_ascii=False,indent=2)
                print(f'Backup gerado: {file_path}')
                return 0
            count = db.scalar(select(func.count()).select_from(User))
            if args.command == 'has-admin':
                print('Administrador configurado.' if count else 'Ainda não existe administrador.')
                return 0 if count else 1
            if db.get(User,args.username) or (count and args.command=='create-admin'):
                print('Conta já configurada ou administrador já existente. Nenhuma credencial foi alterada.')
                return 1
            if not args.username.isascii() or len(args.username)<3 or len(args.username)>50:
                parser.error('Nome de usuário deve ter de 3 a 50 caracteres ASCII.')
            a = getpass.getpass('Crie uma senha (mínimo 12 caracteres): ')
            b = getpass.getpass('Confirme a senha: ')
            if a != b or len(a) < 12:
                print('Senhas diferentes ou muito curtas. Nenhuma conta criada.')
                return 1
            db.add(User(username=args.username, password_hash=hash_password(a)))
            db.flush()
            db.add(UserRole(username=args.username,role='admin' if args.command=='create-admin' else args.role))
            db.commit()
            print(f'Conta {args.username} criada. Guarde a senha em local seguro.')
            return 0
    finally:
        engine.dispose()

if __name__ == '__main__':
    raise SystemExit(main())
