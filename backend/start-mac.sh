#!/bin/zsh
set -euo pipefail
cd "$(dirname "$0")"
if [[ ! -x .venv/bin/python ]]; then echo 'Ambiente não configurado. Execute: zsh backend/setup-mac.sh' >&2; exit 1; fi
source .venv/bin/activate
if ! python -m egidius_api.cli has-admin; then echo 'Crie o administrador antes de iniciar. Consulte a documentação.' >&2; exit 1; fi
exec uvicorn egidius_api.main:app --host 127.0.0.1 --port 8017
