#!/bin/zsh
set -eu
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  echo "Node.js/npm não localizados. Não alterei o seu Mac."
  echo "Execute: sw_vers -productVersion; uname -m; node -v; npm -v"
  exit 1
fi
printf 'Node: '; node -v
printf 'npm: '; npm -v
if [ ! -d node_modules ]; then
  echo "Instalando dependências (necessita Internet)..."
  npm install
fi
echo "Iniciando EGIDIUS 2.0 — protótipo visual..."
npm run dev
