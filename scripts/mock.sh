#!/usr/bin/env bash
# Helper behind `make mock-up` / `make mock-down` (run those instead; see docs/LOCAL_DEV_MOCK.md).
# Runs GradeView on your laptop with FAKE data from dbcron/tests/fixtures/canvas_mock.
# No project secrets, Google Sheets or Canvas needed. Settings come from the root .env:
#   DEV_ADMIN_EMAIL  your berkeley.edu email (the only admin on your machine)
#   REDIS_DB_SECRET  any password for the local Redis
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ADMIN_EMAIL="$(printf '%s' "${DEV_ADMIN_EMAIL:-}" | tr '[:upper:]' '[:lower:]')"
RPW="${REDIS_DB_SECRET:-}"
REDIS_PORT="${REDIS_PORT:-6390}"
API_PORT="${API_PORT:-8000}"
WEB_PORT="${WEB_PORT:-3000}"
CONTAINER="${REDIS_CONTAINER:-gradeview-dev-redis}"
LOGS="$ROOT/.dev-logs"

fail() { echo "ERROR: $*" >&2; exit 1; }
need() { command -v "$1" >/dev/null 2>&1 || fail "'$1' is not installed. $2"; }
port_busy() { lsof -nP -iTCP:"$1" -sTCP:LISTEN -t >/dev/null 2>&1; }
wait_for() {
  for _ in $(seq 1 80); do curl -s -o /dev/null --max-time 5 "$1" && return 0; sleep 3; done
  fail "Timed out waiting for $1 (see $LOGS)"
}

down() {
  for port in "$WEB_PORT" "$API_PORT"; do
    pids="$(lsof -nP -iTCP:"$port" -sTCP:LISTEN -t 2>/dev/null || true)"
    if [ -n "$pids" ]; then kill $pids && echo "stopped the server on port $port"; fi
  done
  if [ "${1:-}" = "--reset" ]; then
    docker rm -f "$CONTAINER" >/dev/null 2>&1 && echo "deleted the local Redis (fake data)"
  else
    docker stop "$CONTAINER" >/dev/null 2>&1 && echo "stopped the local Redis"
  fi
}

up() {
  [ -n "$ADMIN_EMAIL" ] || fail "Set DEV_ADMIN_EMAIL=your_email@berkeley.edu in the .env file (copy .env.example to .env first)."
  [ -n "$RPW" ] || fail "Set REDIS_DB_SECRET in the .env file (any password works for the local Redis)."
  need docker "Install Docker Desktop: https://www.docker.com/products/docker-desktop/"
  need node "Install Node.js 20.10 or newer: https://nodejs.org/"
  need npm "It comes with Node.js."
  need python3 "Install Python 3.8 or newer: https://www.python.org/downloads/"
  need curl "Install curl."
  need lsof "Install lsof."
  node -e 'const [a,b]=process.versions.node.split(".").map(Number); process.exit(a>20||(a===20&&b>=10)?0:1)' \
    || fail "Node.js $(node -v) is too old; the API needs Node 20.10 or newer (get the LTS version from nodejs.org)."
  docker info >/dev/null 2>&1 || fail "Docker is not running. Open Docker Desktop and try again."
  mkdir -p "$LOGS"

  echo "1/4 Local Redis in Docker (port $REDIS_PORT)"
  if docker ps -a --format '{{.Names}}' | grep -qx "$CONTAINER"; then
    docker start "$CONTAINER" >/dev/null
  else
    port_busy "$REDIS_PORT" && fail "Port $REDIS_PORT is in use. Add REDIS_PORT=<free port> to .env and run again."
    docker run -d --name "$CONTAINER" -p "127.0.0.1:$REDIS_PORT:6379" redis:7-alpine redis-server --requirepass "$RPW" >/dev/null
  fi
  sleep 1
  docker exec "$CONTAINER" redis-cli -a "$RPW" --no-auth-warning PING >/dev/null 2>&1 \
    || fail "The local Redis has a different password. Run 'make mock-reset', then 'make mock-up' again."

  echo "2/4 Load the fake course data"
  if [ ! -x "$ROOT/dbcron/.venv/bin/python" ]; then
    python3 -m venv "$ROOT/dbcron/.venv"
    "$ROOT/dbcron/.venv/bin/pip" install --quiet --disable-pip-version-check redis python-dotenv
  fi
  (cd "$ROOT/dbcron" && env -i PATH="$PATH" HOME="$HOME" \
    SERVER_HOST=localhost SERVER_PORT="$REDIS_PORT" SERVER_DBINDEX=0 BINS_DBINDEX=1 ADMIN_DBINDEX=2 \
    REDIS_DB_SECRET="$RPW" CANVAS_TOTAL_POINTS=400 \
    .venv/bin/python canvas_to_redis.py --fixtures tests/fixtures/canvas_mock --write-fixtures >"$LOGS/load.log" 2>&1) \
    || fail "Loading the fake data failed (see $LOGS/load.log)"
  echo "    $(tail -1 "$LOGS/load.log")"

  echo "3/4 Install packages (first run only, a few minutes)"
  [ -d "$ROOT/api/node_modules" ] || (cd "$ROOT/api" && npm ci --no-audit --no-fund >"$LOGS/npm-api.log" 2>&1) \
    || fail "npm install for api/ failed (see $LOGS/npm-api.log)"
  # website/package-lock.json is out of sync with package.json, so npm ci refuses; --no-save leaves the lockfile untouched.
  [ -d "$ROOT/website/node_modules" ] || (cd "$ROOT/website" && npm install --no-save --no-audit --no-fund >"$LOGS/npm-web.log" 2>&1) \
    || fail "npm install for website/ failed (see $LOGS/npm-web.log)"

  echo "4/4 Start the API (port $API_PORT) and the website (port $WEB_PORT)"
  node_config="$(python3 -c 'import json, sys; print(json.dumps({"redis": {"host": "localhost", "port": int(sys.argv[1])}, "admins": [sys.argv[2]]}))' "$REDIS_PORT" "$ADMIN_EMAIL")"
  if port_busy "$API_PORT"; then echo "    port $API_PORT already in use; assuming the API is running"; else
    (cd "$ROOT/api" && NODE_ENV=development NODE_CONFIG="$node_config" REDIS_DB_SECRET="$RPW" PORT="$API_PORT" exec nohup node server.js) \
      >"$LOGS/api.log" 2>&1 </dev/null &
  fi
  if port_busy "$WEB_PORT"; then echo "    port $WEB_PORT already in use; assuming the website is running"; else
    (cd "$ROOT/website" && BROWSER=none PORT="$WEB_PORT" REACT_APP_PROXY_SERVER="http://localhost:$API_PORT" exec nohup npx react-scripts start) \
      >"$LOGS/web.log" 2>&1 </dev/null &
  fi
  wait_for "http://localhost:$API_PORT/api/v2/bins"
  echo "    API is up; waiting for the website (about a minute the first time)..."
  wait_for "http://localhost:$WEB_PORT/"

  echo
  echo "GradeView is running with fake data: http://localhost:$WEB_PORT"
  echo "Sign in with Google as $ADMIN_EMAIL. Stop it with: make mock-down"
  [ "$WEB_PORT" = "3000" ] || echo "Note: Google sign-in only works on port 3000."
}

case "${1:-}" in
  up) up ;;
  down) down ;;
  reset) down --reset ;;
  *) echo "Usage: make mock-up | make mock-down | make mock-reset"; exit 1 ;;
esac
