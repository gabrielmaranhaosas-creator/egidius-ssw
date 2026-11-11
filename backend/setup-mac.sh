#!/bin/zsh
set -euo pipefail
cd "$(dirname "$0")"
if ! command -v python3 >/dev/null 2>&1; then echo 'Python 3 não encontrado.' >&2; exit 1; fi
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r requirements-dev.txt
printf '\n%s\n' 'Python configurado. Crie o administrador:' 'cd "$HOME/Documents/EGIDIUS-2/backend"' 'source .venv/bin/activate' 'python -m egidius_api.cli create-admin --username admin'
