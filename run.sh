#!/usr/bin/env bash
# APEX-UI — start the app.
#   ./run.sh          dev server (hot reload)
#   ./run.sh prod     production build + start
#   PORT=3000 ./run.sh
set -euo pipefail

cd "$(dirname "$0")"

PORT="${PORT:-3100}"
MODE="${1:-dev}"

# deps
if [ ! -d node_modules ] || [ package.json -nt node_modules ]; then
  echo "==> installing dependencies"
  npm install
fi

# env
if [ ! -f .env.local ]; then
  echo "==> no .env.local — copying the example (the agent needs keys to talk)"
  cp .env.local.example .env.local
fi

# port
if lsof -ti:"$PORT" >/dev/null 2>&1; then
  echo "!! port $PORT is already in use:"
  lsof -i:"$PORT" | tail -n +2
  echo "   free it, or run:  PORT=<other> ./run.sh"
  exit 1
fi

URL="http://localhost:$PORT"

case "$MODE" in
  dev)
    echo "==> APEX-UI dev on $URL   (ctrl-C to stop)"
    (sleep 4 && open -a Safari "$URL") &
    exec npx next dev -p "$PORT"
    ;;
  prod|build|start)
    echo "==> building"
    npx next build
    echo "==> APEX-UI production on $URL   (ctrl-C to stop)"
    (sleep 3 && open -a Safari "$URL") &
    exec npx next start -p "$PORT"
    ;;
  *)
    echo "usage: ./run.sh [dev|prod]"
    exit 1
    ;;
esac
