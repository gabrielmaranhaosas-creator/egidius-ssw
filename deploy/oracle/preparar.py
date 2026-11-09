"""Prepara dados e configuração privados em servidor novo; não cria recursos OCI."""
import argparse
import hashlib
import ipaddress
import json
import os
from pathlib import Path
import re
import secrets
import shutil
import sqlite3
import sys
import tempfile
import zipfile

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'backend'))
from egidius_api.backup_format import validar_banco


def validar_dominio(domain):
    domain = domain.lower().rstrip('.')
    try:
        ipaddress.ip_address(domain)
    except ValueError:
        pass
    else:
        raise ValueError('Use um nome DNS público para o certificado HTTPS.')
    labels = domain.split('.')
    if (len(domain) > 253 or len(labels) < 2
            or labels[-1] in ('localhost', 'local', 'test', 'invalid', 'example')
            or not all(re.fullmatch(r'[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?', v) for v in labels)):
        raise ValueError('Informe somente o nome DNS público, sem URL, porta ou caminho.')
    return domain


def privado(path, text):
    with path.open('x', encoding='utf-8') as out:
        path.chmod(0o600)
        out.write(text)


def preparar(archive, root, domain):
    domain = validar_dominio(domain)
    root = Path(root).expanduser().absolute()
    if any(p.is_symlink() for p in (root, *root.parents)):
        raise ValueError('O destino não pode conter links simbólicos.')
    root = root.resolve()
    if root.is_relative_to(Path(__file__).resolve().parents[2]):
        raise ValueError('Dados e segredos devem ficar fora do checkout do código.')
    if not re.fullmatch(r'/[A-Za-z0-9_./-]+', str(root)):
        raise ValueError('Use um caminho absoluto sem espaços para os dados do servidor.')
    if root.exists():
        raise ValueError('O destino já existe. Nenhum dado ou convite será sobrescrito.')
    if not root.parent.is_dir():
        raise ValueError('A pasta pai do destino deve existir.')
    os.umask(0o077)
    stage = Path(tempfile.mkdtemp(prefix='.egidius-preparar-', dir=root.parent))
    try:
        for folder in ('data/media', 'private', 'caddy/data', 'caddy/config', 'backups'):
            (stage / folder).mkdir(parents=True, exist_ok=True, mode=0o700)
        database = stage / 'data/egidius.sqlite3'
        with zipfile.ZipFile(archive) as bundle:
            infos = bundle.infolist()
            if len(infos) > 10000 or sum(i.file_size for i in infos) > 3 * 1024**3:
                raise ValueError('Backup acima de 3 GB ou 10.000 entradas.')
            if len({i.filename for i in infos}) != len(infos):
                raise ValueError('O ZIP contém entradas duplicadas.')
            if bundle.getinfo('dados/egidius.sqlite3').file_size > 512 * 1024**2:
                raise ValueError('Banco acima de 512 MB; use transferência assistida.')
            with bundle.open('dados/egidius.sqlite3') as src, database.open('xb') as dst:
                shutil.copyfileobj(src, dst)
            database.chmod(0o600)
            files = validar_banco(database)
            names = set()
            for name, size in files:
                if (not isinstance(name, str) or Path(name).name != name
                        or name in ('', '.', '..') or '\\' in name or name in names
                        or not isinstance(size, int) or size < 0):
                    raise ValueError('Referência de mídia inválida no banco.')
                names.add(name)
                info = bundle.getinfo('media/' + name)
                if info.is_dir() or info.file_size != size:
                    raise ValueError('Mídia ausente ou com tamanho divergente.')
                with bundle.open(info) as src, (stage / 'data/media' / name).open('xb') as dst:
                    shutil.copyfileobj(src, dst)
        token = secrets.token_urlsafe(48)
        privado(stage / 'private/app.env', '\n'.join([
            'EGIDIUS_REQUIRE_PERSISTENCE=true',
            'EGIDIUS_DATA_VOLUME=/var/data',
            'EGIDIUS_DATABASE_URL=sqlite:////var/data/egidius.sqlite3',
            'EGIDIUS_MEDIA_DIR=/var/data/media',
            'EGIDIUS_SECURE_COOKIES=true',
            'EGIDIUS_LOCAL_ACCESS=false',
            'EGIDIUS_ALLOWED_ORIGINS=https://' + domain,
            'EGIDIUS_PUBLIC_INVITE_TOKEN=' + token,
            '',
        ]))
        privado(stage / 'private/compose.env', f'EGIDIUS_ROOT={root}\nEGIDIUS_DOMAIN={domain}\n')
        privado(stage / 'private/convite.txt', f'https://{domain}/#convite={token}\n')
        with sqlite3.connect(database.as_uri() + '?mode=ro', uri=True) as con:
            counts = {table: con.execute('SELECT COUNT(*) FROM ' + table).fetchone()[0]
                      for table in ('users', 'athlete_profiles', 'media_assets', 'state_history', 'viagem_ssw_state')}
        report = {'sha256_database': hashlib.sha256(database.read_bytes()).hexdigest(),
                  'media_files': len(files), 'counts': counts}
        privado(stage / 'private/conferencia.json', json.dumps(report, indent=2) + '\n')
        # rename não substitui um diretório com dados. O destino nunca é limpo.
        stage.rename(root)
        print('Dados privados preparados. Banco íntegro; mídia conferida: ' + str(len(files)))
        print('Configuração e convite salvos em arquivos privados. Nenhum segredo foi exibido.')
        return report
    finally:
        if stage.exists():
            shutil.rmtree(stage)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--backup', required=True, type=Path)
    parser.add_argument('--domain', required=True)
    parser.add_argument('--root', type=Path, default=Path('/opt/egidius'))
    args = parser.parse_args()
    try:
        preparar(args.backup, args.root, args.domain)
    except (ValueError, OSError, zipfile.BadZipFile, KeyError, sqlite3.Error) as error:
        raise SystemExit('INTERROMPIDO: ' + str(error))
