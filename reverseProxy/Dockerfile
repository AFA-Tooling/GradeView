FROM nginx:1.30.5-alpine3.24

# The official image renders $NGINX_ENVSUBST_TEMPLATE_DIR/*.template into
# /etc/nginx/conf.d/ at start-up. Production (HTTPS) is the default;
# docker-compose.dev.yml switches to templates/development (HTTP only).
# Only NGINX_* environment variables are substituted, so nginx's own
# variables ($host, $request_uri, ...) always survive.
ENV NGINX_SERVER_NAME=gradeview.eecs.berkeley.edu \
    NGINX_ENVSUBST_TEMPLATE_DIR=/etc/nginx/templates/production \
    NGINX_ENVSUBST_FILTER=^NGINX_

COPY templates/ /etc/nginx/templates/
COPY snippets/ /etc/nginx/snippets/

EXPOSE 80 443
