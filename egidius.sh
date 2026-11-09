#!/bin/bash
# EGIDIUS 2.0 - inicializador local controlado. Somente processos iniciados por este script.
set -Eeuo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUN="$ROOT/backend/var/run"
PY="$ROOT/backend/.venv/bin/python"
VITE="$ROOT/node_modules/.bin/vite"
mkdir -p "$RUN"
chmod 700 "$RUN"

is_owned(){
  local pidfile="$1" pattern="$2" pid cmd
  [[ -f "$pidfile" ]] || return 1
  pid="$(cat "$pidfile" 2>/dev/null || true)"
  [[ "$pid" =~ ^[0-9]+$ ]] || return 1
  cmd="$(ps -p "$pid" -o command= 2>/dev/null || true)"
  [[ -n "$cmd" && "$cmd" == *"$pattern"* ]]
}
port_free(){
  local port="$1"
  if ! command -v lsof >/dev/null 2>&1;then echo "Comando lsof não disponível. Não é seguro iniciar sem conferir as portas." >&2;return 1;fi
  if lsof -nP -iTCP:"$port" -sTCP:LISTEN 2>/dev/null | grep -q LISTEN; then
    echo "A porta $port já está ocupada. Não vou encerrar um processo desconhecido." >&2
    lsof -nP -iTCP:"$port" -sTCP:LISTEN || true
    return 1
  fi
}
wait_ready(){
  local url="$1" attempts=0
  until curl -fsS --max-time 2 "$url" >/dev/null 2>&1; do
    attempts=$((attempts+1))
    if (( attempts>=30 ));then return 1;fi
    sleep 1
  done
}
start(){
  [[ -x "$PY" ]] || { echo 'Python não configurado. Execute: bash backend/setup-mac.sh' >&2; exit 1; }
  [[ -x "$VITE" ]] || { echo 'Dependências do frontend ausentes. Execute: npm install' >&2; exit 1; }
  if is_owned "$RUN/api.pid" 'uvicorn egidius_api.main:app' || is_owned "$RUN/web.pid" 'vite'; then
    echo 'O EGIDIUS já tem serviços iniciados por este gerenciador. Verifique: bash egidius.sh status' >&2
    exit 1
  fi
  port_free 8017
  port_free 5173
  echo 'Iniciando EGIDIUS local...'
  pushd "$ROOT/backend" >/dev/null
  EGIDIUS_LOCAL_ACCESS=true nohup "$PY" -m uvicorn egidius_api.main:app --host 127.0.0.1 --port 8017 --no-proxy-headers >> "$RUN/api.log" 2>&1 &
  echo $! > "$RUN/api.pid"
  popd >/dev/null
  if ! wait_ready 'http://127.0.0.1:8017/api/health';then
    echo "A API não respondeu. Consulte $RUN/api.log" >&2
    stop_process "$RUN/api.pid" 'uvicorn egidius_api.main:app'
    exit 1
  fi
  pushd "$ROOT" >/dev/null
  nohup "$VITE" --host 127.0.0.1 >> "$RUN/web.log" 2>&1 &
  echo $! > "$RUN/web.pid"
  popd >/dev/null
  if ! wait_ready 'http://127.0.0.1:5173/';then
    echo "O frontend não respondeu. Consulte $RUN/web.log" >&2
    stop_process "$RUN/web.pid" 'vite'
    stop_process "$RUN/api.pid" 'uvicorn egidius_api.main:app'
    exit 1
  fi
  echo 'EGIDIUS iniciado: http://127.0.0.1:5173/'
  echo 'API: http://127.0.0.1:8017/api/health'
  echo 'Parar ambos: bash egidius.sh parar'
  if [[ "${EGIDIUS_OPEN_BROWSER:-0}" == 1 ]] && command -v open >/dev/null;then open 'http://127.0.0.1:5173/';fi
}
stop_process(){
  local pidfile="$1" pattern="$2" pid
  if is_owned "$pidfile" "$pattern";then
    pid="$(cat "$pidfile")"
    kill "$pid" 2>/dev/null || true
    echo "Processo $pid encerrado."
    rm -f "$pidfile"
  elif [[ -f "$pidfile" ]];then
    echo "PID em $pidfile não corresponde ao processo esperado; não será encerrado." >&2
  fi
}
status(){
  if is_owned "$RUN/api.pid" 'uvicorn egidius_api.main:app';then echo "API gerenciada: ativa (PID $(cat "$RUN/api.pid"))";else echo 'API gerenciada: inativa';fi
  if is_owned "$RUN/web.pid" 'vite';then echo "Frontend gerenciado: ativo (PID $(cat "$RUN/web.pid"))";else echo 'Frontend gerenciado: inativo';fi
  echo 'Portas locais:'
  if command -v lsof >/dev/null 2>&1;then lsof -nP -iTCP:8017 -iTCP:5173 -sTCP:LISTEN || true;else echo 'lsof indisponível; portas não verificadas.';fi
}
case "${1:-}" in
  iniciar|start) start ;;
  parar|stop) stop_process "$RUN/web.pid" 'vite'; stop_process "$RUN/api.pid" 'uvicorn egidius_api.main:app' ;;
  status) status ;;
  backup)
    if is_owned "$RUN/api.pid" 'uvicorn egidius_api.main:app'; then
      echo 'Pare a API antes de criar um backup completo: bash egidius.sh parar' >&2; exit 1
    fi
    if command -v lsof >/dev/null 2>&1 && lsof -nP -iTCP:8017 -sTCP:LISTEN 2>/dev/null | grep -q LISTEN; then
      echo 'A porta 8017 está ocupada. Interrompa a API para garantir a consistência da mídia.' >&2; exit 1
    fi
    [[ -x "$PY" ]] || { echo 'Ambiente Python do backend ausente.' >&2; exit 1; }
    (cd "$ROOT" && "$PY" backend/backup-completo.py)
    ;;
  logs) echo "Arquivos de logs: $RUN/api.log | $RUN/web.log"; tail -n 20 "$RUN/api.log" "$RUN/web.log" 2>/dev/null || true ;;
  *) printf 'Uso: bash egidius.sh {iniciar|parar|status|logs|backup}\n'; exit 2 ;;
esac
