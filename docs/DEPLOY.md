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
- On the server (a fresh Debian 12 VM; see section 2 for the Google Cloud side) install the tools below.
  Do **not** use Debian's own `docker.io` / `docker-compose` or `nodejs` / `npm` packages: Debian 12's
  `docker.io` (20.10) has no `docker compose` and `docker-compose` is the old v1, and its Node.js 18 with
  npm 9 stops `make docker` at the website's `npm install` (`Invalid comparator`).

  ```bash
  sudo apt-get update
  sudo apt-get install -y ca-certificates curl git make ufw certbot

  # Docker Engine + Compose plugin from Docker's apt repository (docs.docker.com/engine/install/debian)
  sudo install -m 0755 -d /etc/apt/keyrings
  sudo curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc
  sudo chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
  sudo apt-get update
  sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

  # Node.js 22 (make docker builds the React site on the host) from NodeSource
  curl -fsSL https://deb.nodesource.com/setup_22.x -o /tmp/nodesource_setup.sh
  sudo bash /tmp/nodesource_setup.sh
  sudo apt-get install -y nodejs

  docker compose version   # Docker Compose version v2.x or newer
  node --version           # v22.x (make docker stops with a message on anything older)
  certbot --version        # Debian 12: certbot 2.1.0 (see section 6)
  ```

  Instead of NodeSource you can install Node 22 for the deploy user only with
  [nvm](https://github.com/nvm-sh/nvm) (`nvm install` in `~/GradeView` reads `.nvmrc`).
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

Only **80/tcp and 443/tcp** may be open to the internet. Admins reach **SSH (22/tcp)** through Google's
**IAP TCP forwarding** (`gcloud compute ssh --tunnel-through-iap`), whose connections arrive from
**35.235.240.0/20**, so SSH is allowed only from that range, with key-based login only
(`PasswordAuthentication no` in `/etc/ssh/sshd_config`). The VM sits behind two firewalls and both must say
the same: the **VPC firewall** in Google Cloud (the real perimeter) and **ufw** on the VM.

### VPC firewall and static IP (Google Cloud)

Run these from a machine with `gcloud` access to the project (replace the `<...>` placeholders):

```bash
# Tag the VM, so the two rules below apply to it only
gcloud compute instances add-tags <VM_NAME> --zone=<ZONE> --tags=gradeview
# HTTP and HTTPS from anywhere (80 is needed for certbot and the redirect to HTTPS)
gcloud compute firewall-rules create gradeview-allow-web --network=<NETWORK> --direction=INGRESS \
  --action=ALLOW --rules=tcp:80,tcp:443 --source-ranges=0.0.0.0/0 --target-tags=gradeview
# SSH only through IAP
gcloud compute firewall-rules create gradeview-allow-iap-ssh --network=<NETWORK> --direction=INGRESS \
  --action=ALLOW --rules=tcp:22 --source-ranges=35.235.240.0/20 --target-tags=gradeview
# Review every ingress rule that can reach the VM
gcloud compute firewall-rules list --filter="network:<NETWORK> AND direction=INGRESS" \
  --format="table(name,sourceRanges.list(),allowed[].map().firewall_rule().list(),targetTags.list())"
```

The `default` network comes with `default-allow-ssh` (tcp:22 from 0.0.0.0/0) and `default-allow-rdp`
(tcp:3389 from 0.0.0.0/0), which apply to **every** VM in the network. Delete them
(`gcloud compute firewall-rules delete default-allow-ssh default-allow-rdp`), or restrict them to
35.235.240.0/20 if other VMs need them. After that the list above may only show 22 from 35.235.240.0/20,
80/443 from 0.0.0.0/0, and internal ranges.

Admins then connect with `gcloud compute ssh <VM_NAME> --zone=<ZONE> --tunnel-through-iap`; they need the
IAP-secured Tunnel User role (`roles/iap.tunnelResourceAccessor`) on the project or the VM.

EECS IT points `gradeview.eecs.berkeley.edu` at the VM's external IP, so that address must never change.
Reserve it (this promotes the VM's current ephemeral address) before you send it to EECS IT, or attach an
already reserved one:

```bash
gcloud compute instances describe <VM_NAME> --zone=<ZONE> \
  --format='get(networkInterfaces[0].accessConfigs[0].natIP)'
gcloud compute addresses create gradeview-ip --region=<REGION> --addresses=<THAT_IP>
```

### ufw on the VM

Add the SSH rule first so you do not lock yourself out (`ufw` was installed in section 1):

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow from 35.235.240.0/20 to any port 22 proto tcp   # IAP
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status verbose
```

If admins also SSH in directly from a fixed network (for example the campus VPN range EECS IT gives you),
add both a VPC rule and `sudo ufw allow from <ADMIN_CIDR> to any port 22 proto tcp` for it.

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
```

dbcron needs the same value; the next section copies it into `dbcron/.env`. If you ever change
`REDIS_DB_SECRET`, change it in both files and run `make docker` again.

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

Once `dbcron/.env` exists (copied from the old server, see [Moving from the old server](#moving-from-the-old-server),
or written by hand), copy the root `.env`'s Redis password into it. This replaces an old
`REDIS_DB_SECRET` line and starts a new line if the file does not end with one:

```bash
if [ -f dbcron/.env ]; then
  sed -i '/^REDIS_DB_SECRET=/d' dbcron/.env
  [ -z "$(tail -c 1 dbcron/.env)" ] || echo >> dbcron/.env
  grep '^REDIS_DB_SECRET=' .env >> dbcron/.env
else
  echo "Create dbcron/.env first." >&2
fi
```

### `api/.env` (optional in Docker)

Also arrives through the `./api` volume. In Docker the API gets `REDIS_DB_SECRET` from compose, and
`make dev-local` passes the root `.env` value to the API it runs on the host (dotenv does not override variables
that are already set), so a `REDIS_DB_SECRET` in this file is ignored in both cases. The file only matters for
other variables the API reads.

### Moving from the old server

A fresh clone lacks two things the old server has. Copy them before the first `make docker`, over IAP and
straight from VM to VM, so they never land on your laptop's disk:

- `dbcron/.env`: the Sheet settings and `SERVICE_ACCOUNT_CREDENTIALS` (the repository only has
  `dbcron/canvas.env.example`). Copy `api/.env` the same way if the old server has one.
- `api/uploads/progressreports/`: the progress reports admins uploaded. They are runtime data in the `./api`
  volume, not in git or the image, so without this step the list starts empty.

Run a plain `gcloud compute ssh <VM> --zone=<ZONE> --tunnel-through-iap` to each VM once first, so gcloud has
set up your SSH key. `<OLD_VM>`, `<NEW_VM>`, `<ZONE>` and `<OLD_DIR>` (the old checkout) are placeholders:

```bash
gcloud compute ssh <OLD_VM> --zone=<ZONE> --tunnel-through-iap -- 'cat <OLD_DIR>/dbcron/.env' \
  | gcloud compute ssh <NEW_VM> --zone=<ZONE> --tunnel-through-iap -- 'umask 077 && cat > ~/GradeView/dbcron/.env'
gcloud compute ssh <OLD_VM> --zone=<ZONE> --tunnel-through-iap -- 'tar -C <OLD_DIR>/api/uploads -cf - progressreports' \
  | gcloud compute ssh <NEW_VM> --zone=<ZONE> --tunnel-through-iap -- 'tar -C ~/GradeView/api/uploads -xf -'
```

Then copy the new `REDIS_DB_SECRET` into `dbcron/.env` (block above): the new Redis uses the new random
password, not the old one. If the old service-account key was disabled, or may have been exposed, create a new
key for that service account, put it in `SERVICE_ACCOUNT_CREDENTIALS` and disable the old key. Once the DNS
record points at the new server and it works, delete these files from the old VM (or delete the old VM).

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

`-V` does not delete the replaced anonymous volumes (the API's old `node_modules`, about 100 MB, and the old
Redis data), so every deploy leaves some behind. Remove them now and then:

```bash
docker volume ls -f dangling=true    # volumes no container uses (check nothing else on the server needs them)
docker volume prune -f               # Docker 23+: removes only those unused anonymous volumes
```

## 6. Renewal

Switch the certificate's renewal method to **webroot**, so renewals go through the running nginx (port 80 serves
`/.well-known/acme-challenge/` from `/var/www/certbot`) without stopping anything. With the stack running:

```bash
sudo certbot reconfigure --cert-name gradeview.eecs.berkeley.edu --webroot -w /var/www/certbot
```

`certbot reconfigure` needs certbot 2.3 or newer. **Debian 12's `certbot` package is 2.1.0**, which answers
`unrecognized arguments: reconfigure`; there, edit `/etc/letsencrypt/renewal/gradeview.eecs.berkeley.edu.conf`
by hand instead (`sudo nano ...`). In `[renewalparams]`, change `authenticator = standalone` to
`authenticator = webroot`, then add these lines at the **end of the file**, after all other
`[renewalparams]` keys (`[[webroot_map]]` opens a subsection, so nothing of `[renewalparams]` may follow it):

```ini
webroot_path = /var/www/certbot,
[[webroot_map]]
gradeview.eecs.berkeley.edu = /var/www/certbot
```

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

# Other host names get no answer (nginx closes the connection; curl prints 000)
curl -s -o /dev/null -w '%{http_code}\n' -H 'Host: example.com' http://gradeview.eecs.berkeley.edu/
#   000

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
