#!/usr/bin/env bash
set -Eeuo pipefail

BASE=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
CONFIG=${EGIDIUS_OCI_CONFIG:-/opt/egidius/private/compose.env}
test -f "$CONFIG" || { echo 'Prepare os dados privados antes de iniciar.' >&2; exit 1; }
COMPOSE=(docker compose --env-file "$CONFIG" -f "$BASE/compose.yaml")

case "${1:-status}" in
  iniciar)
    "${COMPOSE[@]}" config --quiet
    "${COMPOSE[@]}" up --detach --build --wait --wait-timeout 180
    echo 'Containers iniciados. Confira o HTTPS público antes de distribuir o convite.'
    ;;
  status) "${COMPOSE[@]}" ps ;;
  parar) "${COMPOSE[@]}" stop ;;
  *) echo 'Uso: bash deploy/oracle/operar.sh iniciar|status|parar' >&2; exit 2 ;;
esac
