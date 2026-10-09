#!/usr/bin/env bash
# Helper behind `make mock-up` / `make mock-down` / `make mock-reset` (run those instead; see
# docs/LOCAL_DEV_MOCK.md). Runs GradeView on your laptop with FAKE data from
# dbcron/tests/fixtures/canvas_mock. No project secrets, Google Sheets or Canvas needed.
# Settings come from the root .env (the Makefile passes them on):
#   DEV_ADMIN_EMAIL  your @berkeley.edu email (the only admin on your machine)
#   REDIS_DB_SECRET  any password for the local Redis
#   REDIS_PORT, MOCK_API_PORT, MOCK_WEB_PORT  optional ports (defaults 6390, 8000, 3000)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd -P)"
ADMIN_EMAIL="$(printf '%s' "${DEV_ADMIN_EMAIL:-}" | tr '[:upper:]' '[:lower:]')"
RPW="${REDIS_DB_SECRET:-}"
REDIS_PORT="${REDIS_PORT:-6390}"
API_PORT="${MOCK_API_PORT:-8000}"
WEB_PORT="${MOCK_WEB_PORT:-3000}"
CONTAINER="${REDIS_CONTAINER:-gradeview-dev-redis}"
REDIS_IMAGE="redis:7.4.11-bookworm"   # same as docker-compose.yml
LOGS="$ROOT/.dev-logs"
API_PID="$LOGS/api.pid"
WEB_PID="$LOGS/web.pid"
# Fingerprint of the settings the running API was started with, so mock-up restarts the API when
# they change. In practice that is DEV_ADMIN_EMAIL: a changed REDIS_PORT or REDIS_DB_SECRET stops
# step 1 (make mock-reset) and a changed MOCK_API_PORT stops the port check (make mock-down), since
# the website's proxy target is fixed when it starts. Holds a hash only.
API_SETTINGS="$LOGS/api.settings"
# Only reachable from this machine, not from the rest of the network.
BIND=127.0.0.1

fail() { echo "ERROR: $*" >&2; exit 1; }
need() { command -v "$1" >/dev/null 2>&1 || fail "'$1' is not installed. $2"; }
port_pids() { lsof -nP -iTCP:"$1" -sTCP:LISTEN -t 2>/dev/null || true; }
port_busy() { [ -n "$(port_pids "$1")" ]; }
describe_port() { # "node (pid 123)" for each program listening on the port
  lsof -nP -iTCP:"$1" -sTCP:LISTEN 2>/dev/null | awk 'NR > 1 { print $1 " (pid " $2 ")" }' | sort -u | paste -sd ',' - | sed 's/,/, /g'
}

# mock-up starts each server in its own process group and saves the group id in
# .dev-logs/<name>.pid, so mock-down stops exactly those processes and nothing else.
group_running() { # group_running <pgid> <pattern>: a process of that group runs a matching command
  ps -A -o pgid=,command= | awk -v g="$1" -v pat="$2" '$1 == g && index($0, pat) { found = 1 } END { exit !found }'
}
group_alive() { # group_alive <pgid>: any process of that group still exists
  ps -A -o pgid= | awk -v g="$1" '$1 == g { found = 1 } END { exit !found }'
}
saved_group() { # saved_group <pidfile> <pattern>: prints the saved group id while that group still runs
  local pgid
  pgid="$(cat "$1" 2>/dev/null || true)"
  case "$pgid" in '' | *[!0-9]*) return 1 ;; esac
  group_running "$pgid" "$2" || return 1
  echo "$pgid"
}
listening_in_group() { # listening_in_group <port> <pgid>
  local p
  for p in $(port_pids "$1"); do
    [ "$(ps -o pgid= -p "$p" 2>/dev/null | tr -d ' ')" = "$2" ] && return 0
  done
  return 1
}
group_ports() { # group_ports <pgid>: the TCP ports that group listens on ("8000"), empty if none
  { lsof -nP -a -g "$1" -iTCP -sTCP:LISTEN -Fn 2>/dev/null || true; } \
    | sed -n 's/^n.*:\([0-9][0-9]*\)$/\1/p' | sort -un | paste -sd ',' - | sed 's/,/, /g'
}
not_on_port() { # not_on_port <name> <pgid> <setting> <port>: error text for a server on another port
  local on
  on="$(group_ports "$2")"
  if [ -n "$on" ]; then
    echo "The $1 from an earlier make mock-up is still running on port $on, not on $3=$4. Run make mock-down first."
  else
    echo "The $1 from an earlier make mock-up is still running, but not on $3=$4. Run make mock-down first."
  fi
}
# Servers started by an older mock-up (before the .pid files): node processes listening on the
# port whose working directory is this checkout's api/ or website/.
legacy_pids() { # legacy_pids <port> <dir>
  local p
  for p in $(port_pids "$1"); do
    [ "$(lsof -a -p "$p" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p')" = "$2" ] && echo "$p"
  done
  return 0
}

start_server() { # start_server <pidfile> <dir> <log> <command...>
  local pidfile="$1" dir="$2" log="$3"
  shift 3
  # Keep the last server's log (for example the error that made you rerun make mock-up).
  if [ -s "$log" ]; then mv -f "$log" "${log%.log}.previous.log"; fi
  set -m   # job control: the background job gets its own process group (id = $!)
  (cd "$dir" && exec nohup "$@") >"$log" 2>&1 </dev/null &
  echo "$!" >"$pidfile"
  set +m
}

stop_server() { # stop_server <name> <pidfile> <pattern> <port> <dir>
  local name="$1" pidfile="$2" pattern="$3" port="$4" dir="$5" pgid legacy on
  if pgid="$(saved_group "$pidfile" "$pattern")"; then
    on="$(group_ports "$pgid")"   # the port it really uses, which may differ from .env's
    kill -TERM -- "-$pgid" 2>/dev/null || true
    for _ in $(seq 1 20); do group_alive "$pgid" || break; sleep 0.25; done
    if group_alive "$pgid"; then kill -KILL -- "-$pgid" 2>/dev/null || true; fi
    echo "stopped the $name${on:+ (port $on)}"
  else
    legacy="$(legacy_pids "$port" "$dir")"
    if [ -n "$legacy" ]; then
      # shellcheck disable=SC2086
      kill $legacy 2>/dev/null || true
      echo "stopped the $name (port $port)"
    elif port_busy "$port"; then
      echo "port $port is used by another program, not by make mock-up; left alone: $(describe_port "$port")"
    fi
  fi
  rm -f "$pidfile"
}

down() {
  stop_server website "$WEB_PID" react-scripts "$WEB_PORT" "$ROOT/website"
  stop_server API "$API_PID" server.js "$API_PORT" "$ROOT/api"
  rm -f "$API_SETTINGS"
  if ! docker info >/dev/null 2>&1; then
    echo "Docker is not running; the local Redis ($CONTAINER) was not touched"
  elif ! docker ps -a --format '{{.Names}}' | grep -qx "$CONTAINER"; then
    echo "the local Redis ($CONTAINER) does not exist; nothing to stop"
  elif [ "${1:-}" = "--reset" ]; then
    # -v also removes the container's anonymous /data volume (the fake data)
    docker rm -f -v "$CONTAINER" >/dev/null && echo "deleted the local Redis (fake data)"
  else
    docker stop "$CONTAINER" >/dev/null && echo "stopped the local Redis"
  fi
}

# Packages are (re)installed when package.json or package-lock.json changed since the last
# install (for example after git pull or git switch), not only on the first run. The hash of
# both files is kept in node_modules/.gradeview-mock-installed.
manifest_hash() {
  (cd "$1" && cat package.json package-lock.json) | python3 -c 'import hashlib, sys; print(hashlib.sha256(sys.stdin.buffer.read()).hexdigest())'
}
settings_hash() { # settings_hash <value...>: one hash of all values, so no setting is stored in clear
  printf '%s\n' "$@" | python3 -c 'import hashlib, sys; print(hashlib.sha256(sys.stdin.buffer.read()).hexdigest())'
}
packages_current() { # packages_current <dir>
  [ "$(cat "$1/node_modules/.gradeview-mock-installed" 2>/dev/null || true)" = "$(manifest_hash "$1")" ]
}
install_packages() { # install_packages <dir> <log> <npm arguments...>
  local dir="$1" log="$2" want
  shift 2
  want="$(manifest_hash "$dir")"
  echo "    ${dir#"$ROOT"/}/: installing packages (first run, or package.json / package-lock.json changed)"
  (cd "$dir" && npm "$@" --no-audit --no-fund >"$log" 2>&1) || fail "npm install in ${dir#"$ROOT"/}/ failed (see $log)"
  echo "$want" >"$dir/node_modules/.gradeview-mock-installed"
}

wait_for() { # wait_for <name> <url> <text the answer must contain> <pidfile> <pattern> <log>
  local body
  for _ in $(seq 1 80); do
    body="$(curl -sf --max-time 5 "$2" 2>/dev/null || true)"
    case "$body" in *"$3"*) return 0 ;; esac
    saved_group "$4" "$5" >/dev/null || fail "The $1 stopped while starting (see $6)"
    sleep 3
  done
  fail "Timed out waiting for the $1 at $2 (see $6)"
}

up() {
  case "$ADMIN_EMAIL" in
    '') fail "Set DEV_ADMIN_EMAIL=your_email@berkeley.edu in the .env file (copy .env.example to .env first)." ;;
    your_email@berkeley.edu) fail "DEV_ADMIN_EMAIL in .env is still the example value. Put YOUR @berkeley.edu email there." ;;
    *[[:space:]]* | *'"'* | *"'"*) fail "DEV_ADMIN_EMAIL in .env must be a plain email address, without quotes or spaces." ;;
    ?*@berkeley.edu) ;;
    *) fail "DEV_ADMIN_EMAIL must be your @berkeley.edu email: GradeView only accepts berkeley.edu Google accounts." ;;
  esac
  [ -n "$RPW" ] || fail "Set REDIS_DB_SECRET in the .env file (any password works for the local Redis)."
  need docker "Install Docker Desktop: https://www.docker.com/products/docker-desktop/"
  need node "Install Node.js 22 (nvm install, or the 22 LTS from https://nodejs.org/)."
  need npm "It comes with Node.js."
  need python3 "Install Python 3.8 or newer: https://www.python.org/downloads/"
  need curl "Install curl."
  need lsof "Install lsof."
  node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 22 ? 0 : 1)' \
    || fail "Node.js $(node -v) is too old; GradeView uses Node 22 (run 'nvm use', which reads .nvmrc, or get the 22 LTS from nodejs.org)."
  docker info >/dev/null 2>&1 || fail "Docker is not running. Open Docker Desktop and try again."
  mkdir -p "$LOGS"

  # Check the ports before starting anything: only servers started by make mock-up may hold them.
  local api_pgid="" web_pgid=""
  if api_pgid="$(saved_group "$API_PID" server.js)"; then
    # A changed MOCK_API_PORT stops here: the running website still sends its requests to the old port.
    listening_in_group "$API_PORT" "$api_pgid" || fail "$(not_on_port API "$api_pgid" MOCK_API_PORT "$API_PORT")"
  elif [ -n "$(legacy_pids "$API_PORT" "$ROOT/api")" ]; then
    fail "An API started by an older make mock-up is running on port $API_PORT. Run make mock-down, then make mock-up."
  elif port_busy "$API_PORT"; then
    fail "Port $API_PORT is used by another program: $(describe_port "$API_PORT"). Quit it, or add MOCK_API_PORT=<free port> to .env, then run make mock-up again."
  fi
  if web_pgid="$(saved_group "$WEB_PID" react-scripts)"; then
    listening_in_group "$WEB_PORT" "$web_pgid" || fail "$(not_on_port website "$web_pgid" MOCK_WEB_PORT "$WEB_PORT")"
  elif [ -n "$(legacy_pids "$WEB_PORT" "$ROOT/website")" ]; then
    fail "A website started by an older make mock-up is running on port $WEB_PORT. Run make mock-down, then make mock-up."
  elif port_busy "$WEB_PORT"; then
    fail "Port $WEB_PORT is used by another program: $(describe_port "$WEB_PORT"). Quit it (Google sign-in only works on port 3000), then run make mock-up again."
  fi

  echo "1/4 Local Redis in Docker (port $REDIS_PORT)"
  local redis_on="" pong=""
  if docker ps -a --format '{{.Names}}' | grep -qx "$CONTAINER"; then
    # The container keeps the port it was created with (also through docker start).
    redis_on="$(docker inspect -f '{{range (index .HostConfig.PortBindings "6379/tcp")}}{{.HostIp}}:{{.HostPort}}{{end}}' "$CONTAINER" 2>/dev/null || true)"
    [ "$redis_on" = "$BIND:$REDIS_PORT" ] \
      || fail "The local Redis ($CONTAINER) uses ${redis_on:-no port}, not $BIND:$REDIS_PORT (REDIS_PORT in .env). Run 'make mock-reset', then 'make mock-up' again (the fake data is reloaded)."
    docker start "$CONTAINER" >/dev/null
  else
    port_busy "$REDIS_PORT" && fail "Port $REDIS_PORT is in use. Add REDIS_PORT=<free port> to .env and run again."
    docker run -d --name "$CONTAINER" -p "$BIND:$REDIS_PORT:6379" "$REDIS_IMAGE" redis-server --requirepass "$RPW" >/dev/null
  fi
  # Check the reply, not the exit code: redis-cli exits 0 when Redis answers with an error, such as
  # NOAUTH for a wrong password or LOADING while it starts (that one is waited out).
  for _ in $(seq 1 20); do
    pong="$(docker exec "$CONTAINER" redis-cli -a "$RPW" --no-auth-warning PING 2>/dev/null || true)"
    case "$pong" in PONG | *NOAUTH* | *WRONGPASS*) break ;; esac
    sleep 0.5
  done
  case "$pong" in
    PONG) ;;
    *NOAUTH* | *WRONGPASS*) fail "The local Redis has a different password. Run 'make mock-reset', then 'make mock-up' again." ;;
    *) fail "The local Redis ($CONTAINER) did not answer${pong:+: $pong}. Check 'docker logs $CONTAINER', then run make mock-up again." ;;
  esac

  echo "2/4 Load the fake course data"
  if [ ! -x "$ROOT/dbcron/.venv/bin/python" ]; then
    python3 -m venv "$ROOT/dbcron/.venv"
    "$ROOT/dbcron/.venv/bin/pip" install --quiet --disable-pip-version-check redis python-dotenv
  fi
  # env -i and --no-dotenv: only the settings below count, never dbcron/.env (Canvas importer
  # settings such as CANVAS_COURSE_ID would change or block the fake data).
  (cd "$ROOT/dbcron" && env -i PATH="$PATH" HOME="$HOME" PYTHONDONTWRITEBYTECODE=1 \
    SERVER_HOST=localhost SERVER_PORT="$REDIS_PORT" SERVER_DBINDEX=0 BINS_DBINDEX=1 ADMIN_DBINDEX=2 \
    REDIS_DB_SECRET="$RPW" CANVAS_TOTAL_POINTS=400 \
    .venv/bin/python canvas_to_redis.py --fixtures tests/fixtures/canvas_mock --write-fixtures --no-dotenv >"$LOGS/load.log" 2>&1) \
    || fail "Loading the fake data failed (see $LOGS/load.log)"
  echo "    $(tail -1 "$LOGS/load.log")"

  echo "3/4 Packages (installed on the first run and whenever package.json or package-lock.json changes)"
  # A server that is still running on the old packages is stopped first and started again in step 4.
  if packages_current "$ROOT/api"; then echo "    api/: packages are up to date"; else
    if [ -n "$api_pgid" ]; then stop_server API "$API_PID" server.js "$API_PORT" "$ROOT/api" | sed 's/^/    /'; api_pgid=""; fi
    install_packages "$ROOT/api" "$LOGS/npm-api.log" ci
  fi
  if packages_current "$ROOT/website"; then echo "    website/: packages are up to date"; else
    if [ -n "$web_pgid" ]; then stop_server website "$WEB_PID" react-scripts "$WEB_PORT" "$ROOT/website" | sed 's/^/    /'; web_pgid=""; fi
    # website/package-lock.json is out of sync with package.json, so npm ci refuses; --no-save leaves the lockfile untouched.
    install_packages "$ROOT/website" "$LOGS/npm-web.log" install --no-save
  fi

  echo "4/4 Start the API (port $API_PORT) and the website (port $WEB_PORT)"
  node_config="$(python3 -c 'import json, sys; print(json.dumps({"redis": {"host": "localhost", "port": int(sys.argv[1])}, "admins": [sys.argv[2]]}))' "$REDIS_PORT" "$ADMIN_EMAIL")"
  api_settings="$(settings_hash "$node_config" "$RPW" "$API_PORT" "$BIND")"
  # The API reads its settings only when it starts, so a corrected DEV_ADMIN_EMAIL needs a restart
  # (see API_SETTINGS at the top for the other settings). An API without a saved fingerprint, for
  # example one started by an older make mock-up, is restarted once too.
  if [ -n "$api_pgid" ] && [ "$(cat "$API_SETTINGS" 2>/dev/null || true)" != "$api_settings" ]; then
    if [ -s "$API_SETTINGS" ]; then
      echo "    your .env settings changed since the API started (for example DEV_ADMIN_EMAIL); restarting the API"
    else
      echo "    the API was started by an older make mock-up (no .dev-logs/api.settings); restarting it once so it uses your current .env"
    fi
    stop_server API "$API_PID" server.js "$API_PORT" "$ROOT/api" | sed 's/^/    /'
    api_pgid=""
  fi
  if [ -n "$api_pgid" ]; then echo "    the API is already running"; else
    start_server "$API_PID" "$ROOT/api" "$LOGS/api.log" \
      env NODE_ENV=development NODE_CONFIG="$node_config" REDIS_DB_SECRET="$RPW" PORT="$API_PORT" LISTEN_HOST="$BIND" node server.js
    echo "$api_settings" >"$API_SETTINGS"
  fi
  if [ -n "$web_pgid" ]; then echo "    the website is already running"; else
    start_server "$WEB_PID" "$ROOT/website" "$LOGS/web.log" \
      env BROWSER=none HOST="$BIND" PORT="$WEB_PORT" REACT_APP_PROXY_SERVER="http://$BIND:$API_PORT" npx react-scripts start
  fi
  wait_for API "http://$BIND:$API_PORT/api/health" '"ok":true' "$API_PID" server.js "$LOGS/api.log"
  echo "    API is up; waiting for the website (about a minute the first time)..."
  wait_for website "http://$BIND:$WEB_PORT/" '<title>GradeView</title>' "$WEB_PID" react-scripts "$LOGS/web.log"

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
