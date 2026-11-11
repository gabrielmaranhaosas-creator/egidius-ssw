#!/usr/bin/env python3
"""Prepara uma pasta de codigo para Render; nao faz push nem cria servicos."""
from __future__ import annotations
import argparse
from datetime import datetime
from pathlib import Path
import shutil

FOLDERS = ('src', 'public', 'backend/egidius_api', 'backend/tests', 'tests', 'tools', 'deploy')
REQUIRED = ('Dockerfile', '.dockerignore', 'render.yaml', 'package.json',
            'package-lock.json', 'backend/requirements.txt',
            'backend/requirements.lock.txt', 'backend/requirements-dev.txt',
            'backend/requirements-dev.lock.txt', 'index.html', 'tsconfig.json', 'vite.config.ts')
OPTIONAL = ('.gitignore', 'README.md', 'GUIA_SSW.md', 'PUBLICAR_RENDER.md', 'PUBLICAR_GRATUITO.md',
            'COMO_ABRIR_NO_MAC.md', 'RELATORIO_ETAPA_01.md', 'egidius.sh',
            'iniciar-mac.sh', 'backend/backup-completo.py', 'backend/backup-mac.sh',
            'backend/setup-mac.sh', 'backend/start-mac.sh', 'tsconfig.node.json',
            'postcss.config.js', 'eslint.config.js')
EXCLUDED = {'node_modules', '.venv', 'venv', '__pycache__', '.pytest_cache',
            '.git', 'dist', 'var', 'backups', 'uploads', 'media', '.egidius-backups', '.DS_Store'}


def excluded(name):
    return (name in EXCLUDED or name == '.env' or name.startswith('.env.')
            or name.endswith(('.sqlite3', '.sqlite3-wal', '.sqlite3-shm', '.db',
                              '.zip', '.log', '.pem', '.key', '.pyc')))


def preparar(project, destination):
    project = project.expanduser().resolve()
    destination = destination.expanduser().resolve()
    if destination == project or project in destination.parents:
        raise RuntimeError('A pasta de publicacao precisa ficar fora do projeto.')
    if destination.exists():
        raise RuntimeError('Destino ja existe. Nenhum arquivo foi substituido.')
    for name in FOLDERS + REQUIRED:
        path = project / name
        if not path.exists() or path.is_symlink():
            raise RuntimeError('Componente obrigatorio ausente ou simbolico: ' + name)
    for name in FOLDERS:
        for path in (project / name).rglob('*'):
            if path.is_symlink():
                raise RuntimeError('Link simbolico encontrado: ' + str(path.relative_to(project)))
    destination.mkdir(parents=True, mode=0o700)
    try:
        for name in FOLDERS:
            shutil.copytree(project / name, destination / name,
                            ignore=lambda _, names: {n for n in names if excluded(n)})
        for name in REQUIRED + OPTIONAL:
            path = project / name
            if path.is_file():
                if path.is_symlink():
                    raise RuntimeError('Link simbolico encontrado: ' + name)
                target = destination / name
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(path, target)
    except BaseException:
        shutil.rmtree(destination)
        raise
    print('PASTA DE CODIGO PREPARADA:', destination)
    print('Dados, backups, .env e dependencias locais foram excluidos.')
    print('Destino de hospedagem: Render. Confira PUBLICAR_RENDER.md.')
    print('Esta rotina nao publica o codigo e nao contrata hospedagem.')
    return destination


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--project', type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument('--destino', type=Path, default=Path.home() / 'Documents' /
                        ('EGIDIUS_PUBLICACAO_' + datetime.now().strftime('%Y%m%d_%H%M%S_%f')))
    args = parser.parse_args()
    try:
        preparar(args.project, args.destino)
    except (OSError, RuntimeError) as error:
        raise SystemExit('INTERROMPIDO: ' + str(error))
