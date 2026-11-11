#!/bin/zsh
set -euo pipefail
cd "$(dirname "$0")"
[[ -x .venv/bin/python ]] || { echo 'Configure primeiro o ambiente Python.' >&2; exit 1; }
umask 077
source .venv/bin/activate
python -m egidius_api.cli backup
