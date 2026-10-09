#!/bin/sh
# Builds the reverse-proxy image and runs `nginx -t` on both templates:
#   production  (HTTPS, the image default) with a throwaway self-signed certificate
#   development (HTTP only, used by docker-compose.dev.yml)
# Never touches real certificates. Usage: make proxy-check
#
# Optional environment:
#   IMAGE              tag for the test image   (default: gradeview-proxy-check)
#   NGINX_SERVER_NAME  server name to render    (default: gradeview.eecs.berkeley.edu)
#   CERT_DIR           where to write the throwaway certificate (default: a new temp dir,
#                      removed afterwards)
set -eu

here=$(cd "$(dirname "$0")" && pwd)
image="${IMAGE:-gradeview-proxy-check}"
name="${NGINX_SERVER_NAME:-gradeview.eecs.berkeley.edu}"

if [ -n "${CERT_DIR:-}" ]; then
    cert_dir="$CERT_DIR"
    mkdir -p "$cert_dir"
else
    cert_dir=$(mktemp -d)
    trap 'rm -rf "$cert_dir"' EXIT
fi

echo "== Building $image"
docker build -q -t "$image" "$here" >/dev/null

echo "== Generating a throwaway self-signed certificate for $name"
mkdir -p "$cert_dir/live/$name"
openssl req -x509 -newkey rsa:2048 -nodes -days 1 -subj "/CN=$name" \
    -keyout "$cert_dir/live/$name/privkey.pem" \
    -out "$cert_dir/live/$name/fullchain.pem" >/dev/null 2>&1

# nginx resolves upstream host names when it loads the config; outside the
# compose network, point them at localhost so `nginx -t` can run.
hosts="--add-host gradeview-web:127.0.0.1 --add-host gradeview-api:127.0.0.1 --add-host dtgui-progress-report:127.0.0.1"

render_and_test='/docker-entrypoint.d/20-envsubst-on-templates.sh >/dev/null && nginx -t -q && cat /etc/nginx/conf.d/default.conf /etc/nginx/snippets/gradeview-locations.conf'

echo "== production template (image default)"
# shellcheck disable=SC2086
prod=$(docker run --rm $hosts -e NGINX_SERVER_NAME="$name" \
    -v "$cert_dir:/etc/letsencrypt:ro" "$image" sh -c "$render_and_test")

echo "== development template"
# shellcheck disable=SC2086
dev=$(docker run --rm $hosts -e NGINX_SERVER_NAME="$name" \
    -e NGINX_ENVSUBST_TEMPLATE_DIR=/etc/nginx/templates/development "$image" sh -c "$render_and_test")

fail=0
expect() { # expect <label> <config> <fixed string>
    if printf '%s\n' "$2" | grep -qF -- "$3"; then :; else
        echo "FAIL [$1]: rendered config lacks: $3"; fail=1
    fi
}
reject() { # reject <label> <config> <fixed string>
    if printf '%s\n' "$2" | grep -qF -- "$3"; then
        echo "FAIL [$1]: rendered config contains: $3"; fail=1
    fi
}

expect prod "$prod" "server_name $name;"
expect prod "$prod" "return 301 https://$name\$request_uri;"
reject prod "$prod" "https://\$host"
expect prod "$prod" "listen 80 default_server;"
expect prod "$prod" "listen 443 ssl default_server;"
expect prod "$prod" "ssl_reject_handshake on;"
expect prod "$prod" "client_max_body_size 6m;"
expect dev "$dev" "client_max_body_size 6m;"
expect prod "$prod" "ssl_certificate     /etc/letsencrypt/live/$name/fullchain.pem;"
expect prod "$prod" "listen 443 ssl;"
expect prod "$prod" "http2 on;"
expect prod "$prod" "server_tokens off;"
reject prod "$prod" '${'
expect dev "$dev" "server_name $name localhost _;"
expect dev "$dev" "server_tokens off;"
reject dev "$dev" "listen 443"
reject dev "$dev" '${'

if [ "$fail" -ne 0 ]; then
    exit 1
fi
echo "OK: both templates render and pass nginx -t"
