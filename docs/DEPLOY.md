# Deploying GradeView to production

Production runs on **gradeview.eecs.berkeley.edu** with `docker-compose.yml`, over HTTPS only.
For local work use `make mock-up` ([LOCAL_DEV_MOCK.md](LOCAL_DEV_MOCK.md)) or `make dev-up`
(`docker-compose.dev.yml`, HTTP only); never run the dev compose file on the server. A bare `make`
only lists the targets; `make docker` is the production stack and stops early on a machine without the
certificate (see section 5).

```
internet ──► :80  nginx (gradeview-reverse-proxy) ── only /.well-known/acme-challenge/, everything else 301 → https
internet ──► :443 nginx ──► /          gradeview-web:3000          (React build, Express)
                       ──► /api       gradeview-api:8000          (Node API) ──► redis:6379 (password)
                       ──► /progress  dtgui-progress-report:8080  (Flask)          ▲
                                                                  dbcron (cron) ───┘
```

Only nginx publishes host ports (80 and 443). Redis, the API, the web server and the progress report
are reachable only on the internal Docker networks (`frontend`, `db`, `concept_map_integration`).

## 1. Server, DNS and code

- The DNS record for `gradeview.eecs.berkeley.edu` is managed by **EECS IT**. We keep the same name; if the
  server (or its public IP) changes, ask EECS IT to point the record at the new server **before** requesting a
  certificate, then check from any machine: `dig +short gradeview.eecs.berkeley.edu`.
- On the server install: Docker Engine with the Compose plugin (`docker compose version`), `git`, `make`,
  Node.js 22 LTS and npm (`make docker` builds the React site on the host), and `certbot`
  (`sudo apt install certbot`, or the snap).
- Start Docker at boot, so the containers come back after a reboot (they all have
  `restart: unless-stopped`): `sudo systemctl enable --now docker`.
- The deploy user runs `docker compose` and `make docker`. Either add it to the `docker` group
  (`sudo usermod -aG docker <deploy-user>`, then log out and back in) or run those commands with `sudo`.
  Membership in the `docker` group is equivalent to root on that machine, so only give it to admins.
- Get the code (deploy from `main`):

  ```bash
  git clone https://github.com/AFA-Tooling/GradeView.git ~/GradeView
  cd ~/GradeView
  git switch main
  ```

  All later commands run in `~/GradeView`.

## 2. Firewall

Only **80/tcp and 443/tcp** may be open to the internet. **SSH (22/tcp)** must be limited to the
networks the admins use (for example the campus VPN range EECS IT gives you), with key-based login only
(`PasswordAuthentication no` in `/etc/ssh/sshd_config`).

Example with `ufw` (add the SSH rule first so you do not lock yourself out):

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow from <ADMIN_CIDR> to any port 22 proto tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

> **Docker bypasses ufw.** Ports published by Docker (`ports:` in compose) are opened with iptables rules
> that run before ufw's, so a ufw "deny" does not protect them. That is why the production compose file
> publishes no port for Redis, the API, the web server or the progress report. Do not add `ports:` to those
> services on the server; use `docker compose exec` to reach them.

## 3. Configuration files

All three files are git-ignored and hold secrets. Create them as described below; the last step
([Permissions](#permissions)) makes them readable only by the deploy user.

### Root `.env` (read by `docker compose` and the Makefile)

Start from the example and **replace the example Redis password** right away. The example value
(`change-me-local-only`) is public, and `make docker` refuses to start with it. These commands write a random
value without printing it (GNU `sed`, as on the server):

```bash
cp .env.example .env
sed -i "s/^REDIS_DB_SECRET=.*/REDIS_DB_SECRET=$(openssl rand -hex 32)/" .env
# dbcron needs the same value: create dbcron/.env first (next section), then copy the line over
sed -i '/^REDIS_DB_SECRET=/d' dbcron/.env && grep '^REDIS_DB_SECRET=' .env >> dbcron/.env
```

If you ever change `REDIS_DB_SECRET`, change it in both files and run `make docker` again.

| Variable | Required | Notes |
|---|---|---|
| `REDIS_DB_SECRET` | **required** | Redis password. Compose refuses to start without it, starts Redis with it and passes it to the API. Use letters and digits only, because the API puts it in a `redis://` URL: `openssl rand -hex 32`. |
| `NGINX_SERVER_NAME` | optional | Defaults to `gradeview.eecs.berkeley.edu`. Must match the certificate directory `/etc/letsencrypt/live/<name>/`. |
| `PROGRESS_REPORT_PORT` | optional | Defaults to `8080`. nginx proxies `/progress` to port 8080, so keep 8080. |
| `API_PORT`, `REACT_APP_PORT` | optional | The API and the web server fall back to 8000 and 3000 when these are unset. nginx expects 8000 and 3000, so keep them. |
| `REACT_APP_PROXY_SERVER` | optional | Where the web container's own `/api` proxy sends requests. Compose sets `http://api:8000` when it is unset. nginx sends `/api` straight to the API, so this proxy is normally not used. |

`DEV_ADMIN_EMAIL` and `DEV_PROXY_BIND` are only used by `make mock-up` / `docker-compose.dev.yml`.
`DEV_PROXY_BIND` replaces the old `REVERSE_PROXY_LISTEN`, which is no longer read; delete a leftover
`REVERSE_PROXY_LISTEN=0.0.0.0:80` line from an old `.env`.

### `dbcron/.env` (required)

Compose mounts `./dbcron` over `/dbcron`, so the jobs read this file at runtime (it is never copied into the
image, see `dbcron/.dockerignore`). The cron jobs only see this file, not the container environment, so every
value must be here:

| Variable | Required | Value |
|---|---|---|
| `SERVER_HOST` | **required** | `redis` (exactly; `update_db.py` / `update_bins.py` fall back to `localhost:6379` otherwise, which does not work inside the container) |
| `SERVER_PORT` | **required** | `6379` |
| `REDIS_DB_SECRET` | **required** | the **same** value as in the root `.env` |
| `SERVER_DBINDEX`, `BINS_DBINDEX` | **required** | `0`, `1` |
| `SPREADSHEET_ID`, `SPREADSHEET_SHEETNAME`, `SPREADSHEET_WORKSHEET`, `BINS_WORKSHEET`, `SPREADSHEET_SCOPES` (JSON list) | **required** for the Google Sheet jobs | |
| `ASSIGNMENT_CATEGORYROW/COL`, `ASSIGNMENT_CONCEPTSROW/COL`, `ASSIGNMENT_MAXPOINTSROW/COL` | **required** for the Google Sheet jobs | |
| `SERVICE_ACCOUNT_CREDENTIALS` | **required** for the Google Sheet jobs | service-account JSON on one line. Do not leave key files in `dbcron/`. |
| `ADMIN_DBINDEX`, `CANVAS_*` | Canvas importer only | see `dbcron/canvas.env.example` |

### `api/.env` (optional in Docker)

Also arrives through the `./api` volume. In Docker the API gets `REDIS_DB_SECRET` from compose, and
`make dev-local` passes the root `.env` value to the API it runs on the host (dotenv does not override variables
that are already set), so a `REDIS_DB_SECRET` in this file is ignored in both cases. The file only matters for
other variables the API reads.

### Permissions

Once the files exist, make them readable only by the deploy user (`api/.env` is optional, so it is only
changed if it exists):

```bash
chmod 600 .env dbcron/.env
[ ! -f api/.env ] || chmod 600 api/.env
```

## 4. First certificate (one-time bootstrap)

nginx's HTTPS server cannot start without a certificate, and the webroot challenge needs nginx running. Break
the loop by issuing the first certificate with certbot's own temporary web server while port 80 is still free:

```bash
cd ~/GradeView                      # the checkout from section 1
docker compose down                 # if anything is running: port 80 must be free
sudo mkdir -p /var/www/certbot
sudo certbot certonly --standalone \
  --cert-name gradeview.eecs.berkeley.edu -d gradeview.eecs.berkeley.edu \
  -m <course-staff-email> --agree-tos --no-eff-email
sudo ls /etc/letsencrypt/live/gradeview.eecs.berkeley.edu/   # fullchain.pem  privkey.pem ...
```

`--cert-name` keeps the directory name equal to `NGINX_SERVER_NAME` (no `-0001` suffix). If the server
already has a valid certificate for this name (same server, same domain), skip this step.

## 5. Start (and update) the stack

```bash
cd ~/GradeView
git pull --ff-only   # on updates: get the new code first (deploy from main)
make docker          # checks, npm install --no-save + build of website/ on the host, docker compose build, up -dV
docker compose ps
```

`make docker` first runs `make prod-check`, which stops before building anything if
`/etc/letsencrypt/live/<NGINX_SERVER_NAME>/fullchain.pem` or `privkey.pem` is missing (do section 4 first) or if
`REDIS_DB_SECRET` is still the example value (section 3). certbot makes `live/` readable by root only, so when
the deploy user cannot look inside it, the check runs in a short-lived container (this needs Docker access).

`make docker` installs the website's packages with `npm install --no-save`, so the tracked
`website/package-lock.json` is not rewritten and the next `git pull --ff-only` still applies (that lockfile is
out of sync with `package.json`, so `npm ci` would refuse). If an older `make docker` already rewrote it
(`git status` lists `website/package-lock.json` as modified), discard that change before pulling:
`git checkout -- website/package-lock.json`.

Every service has `restart: unless-stopped`: after a reboot or a Docker restart the whole stack comes back by
itself (Docker must be enabled at boot, section 1). After `docker compose down` or `docker compose stop`
nothing runs until the next `make docker`, and the certificate renewal hook below needs the proxy running.

`up -dV` renews anonymous volumes, so Redis starts empty and dbcron reloads it on start (Redis only holds data
copied from the Sheet/Canvas). This also matters when moving from the old `redis:latest` (8.x) to the pinned
`redis:7.4` image: an RDB file written by a newer Redis cannot be loaded by 7.4. If you start Redis without
`-V` and its log says `Can't handle RDB format version`, run `docker compose up -d --renew-anon-volumes redis`.

## 6. Renewal

Switch the certificate's renewal method to **webroot**, so renewals go through the running nginx (port 80 serves
`/.well-known/acme-challenge/` from `/var/www/certbot`) without stopping anything. With the stack running:

```bash
sudo certbot reconfigure --cert-name gradeview.eecs.berkeley.edu --webroot -w /var/www/certbot
```

(`certbot reconfigure` needs certbot 2.3 or newer. On older versions edit
`/etc/letsencrypt/renewal/gradeview.eecs.berkeley.edu.conf`: set `authenticator = webroot` and, under
`[renewalparams]`, `webroot_path = /var/www/certbot,` plus a `[[webroot_map]]` section with
`gradeview.eecs.berkeley.edu = /var/www/certbot`.)

nginx only reads certificates when it starts or reloads, so add a deploy hook. certbot runs every script in this
directory after each successful renewal:

```bash
sudo tee /etc/letsencrypt/renewal-hooks/deploy/reload-gradeview-nginx.sh >/dev/null <<'EOF'
#!/bin/sh
docker exec gradeview-reverse-proxy nginx -s reload
EOF
sudo chmod 755 /etc/letsencrypt/renewal-hooks/deploy/reload-gradeview-nginx.sh
sudo /etc/letsencrypt/renewal-hooks/deploy/reload-gradeview-nginx.sh   # test the hook once by hand
sudo certbot renew --dry-run                                           # test renewal through nginx
systemctl list-timers | grep -i certbot                                # the package's renewal timer
```

Keep the compose mounts as they are: `/etc/letsencrypt` is mounted whole (the files in `live/` are symlinks into
`archive/`) and read-only, and `/var/www/certbot` is shared with certbot on the host.

## 7. Post-deploy checks

From a machine **outside** the server:

```bash
curl -sI http://gradeview.eecs.berkeley.edu/some/path | grep -iE '^HTTP|^location'
#   HTTP/1.1 301 Moved Permanently
#   Location: https://gradeview.eecs.berkeley.edu/some/path

curl -sI https://gradeview.eecs.berkeley.edu/ | grep -iE '^HTTP|^server|^strict-transport|^x-content-type|^referrer-policy'
#   HTTP/2 200
#   server: nginx                          (no version number)
#   strict-transport-security: max-age=31536000
#   x-content-type-options: nosniff
#   referrer-policy: strict-origin-when-cross-origin

curl -s https://gradeview.eecs.berkeley.edu/api/health                  # {"ok":true}
curl -s -o /dev/null -w '%{http_code}\n' https://gradeview.eecs.berkeley.edu/progress   # 200

# TLS versions. Needs OpenSSL 3.x. On macOS /usr/bin/openssl is LibreSSL, which stops with
# "error setting cipher list" before it even connects; that is NOT a pass. Use Homebrew's OpenSSL
# (brew install openssl, then OPENSSL="$(brew --prefix openssl)/bin/openssl") or run this on Linux.
OPENSSL=${OPENSSL:-openssl}
# TLS 1.2 and 1.3 must work:
$OPENSSL s_client -connect gradeview.eecs.berkeley.edu:443 -servername gradeview.eecs.berkeley.edu \
  -tls1_2 </dev/null 2>&1 | grep -E '^New,|Verify return code'
#   New, TLSv1.2, Cipher is ECDHE-RSA-AES256-GCM-SHA384      (or another ECDHE GCM/CHACHA20 cipher)
#   Verify return code: 0 (ok)
$OPENSSL s_client -connect gradeview.eecs.berkeley.edu:443 -servername gradeview.eecs.berkeley.edu \
  -tls1_3 </dev/null 2>&1 | grep -E '^New,|Verify return code'
#   New, TLSv1.3, Cipher is TLS_AES_256_GCM_SHA384
#   Verify return code: 0 (ok)
# TLS 1.1 (and TLS 1.0, with -tls1) must be refused by the server. The output must contain
# "tlsv1 alert protocol version" (SSL alert number 70); any other error proves nothing:
$OPENSSL s_client -connect gradeview.eecs.berkeley.edu:443 -servername gradeview.eecs.berkeley.edu \
  -tls1_1 -cipher 'DEFAULT:@SECLEVEL=0' </dev/null 2>&1 | grep -o 'tlsv1 alert protocol version'
#   tlsv1 alert protocol version

# Nothing except 80/443 (and SSH from the allowed networks) may answer: every line must fail or time out
nc -vz -w 3 gradeview.eecs.berkeley.edu 6379
nc -vz -w 3 gradeview.eecs.berkeley.edu 8080
nc -vz -w 3 gradeview.eecs.berkeley.edu 8000
nc -vz -w 3 gradeview.eecs.berkeley.edu 3000
```

On the server:

```bash
docker compose ps                        # only gradeview-reverse-proxy lists 0.0.0.0:80 and 0.0.0.0:443
sudo ss -ltnp | grep -E ':(6379|8080|8000|3000)\b'   # no output
docker compose exec redis redis-cli ping # NOAUTH Authentication required.
```

Optionally run the public test at <https://www.ssllabs.com/ssltest/> (expect A or better).

## Notes

- **HSTS**: browsers that have seen the header refuse plain HTTP for this host for one year. It does not
  include subdomains (other `*.eecs.berkeley.edu` hosts are not ours) and the site is not on the preload list.
- **Embedding**: there is deliberately no `X-Frame-Options` or CSP `frame-ancestors`, so bCourses can embed
  the concept-map pages.
- **Reverse proxy templates**: `reverseProxy/templates/production/` (HTTPS, image default) and
  `reverseProxy/templates/development/` (HTTP, selected by `docker-compose.dev.yml` through
  `NGINX_ENVSUBST_TEMPLATE_DIR`); the routes are shared in `reverseProxy/snippets/gradeview-locations.conf`.
  After changing them run `make proxy-check`, which runs `nginx -t` on both inside the image with a throwaway
  self-signed certificate.
- **Images** are pinned (`nginx:1.30.5-alpine3.24`, `redis:7.4.11-alpine3.21`, `node:22.23.3-alpine3.24`,
  `python:3.12.15-slim-trixie`, and `tiangolo/uwsgi-nginx:python3.11-2026-09-21` for the progress report).
  Bump the tags deliberately and rebuild with `make docker`.
