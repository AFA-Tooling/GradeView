-include .env
# A bare `make` only prints the targets. `make docker` is the PRODUCTION stack
# (HTTPS only, needs the server's Let's Encrypt certificate); on a laptop use
# `make dev-up` or `make mock-up`.
.DEFAULT_GOAL := help

help:
	@echo "GradeView make targets:"
	@echo "  make mock-up      local stack with fake data (docs/LOCAL_DEV_MOCK.md)"
	@echo "  make dev-up       local Docker stack over HTTP (docker-compose.dev.yml); dev-down stops it"
	@echo "  make dev-local    Redis + dbcron in Docker, API and website on the host"
	@echo "  make proxy-check  nginx -t on both reverse-proxy templates"
	@echo "  make docker       PRODUCTION stack, HTTPS only, on the server (docs/DEPLOY.md)"

init:
	@cd website && npm install
	@cd api && npm install
	@cd website/server && npm install
	@cd website && npm run build

dev-up:
	@docker compose -f docker-compose.dev.yml up -dV

dev-down:
	@docker compose -f docker-compose.dev.yml down

# Run GradeView locally with FAKE data (no secrets needed). Needs DEV_ADMIN_EMAIL and
# REDIS_DB_SECRET in .env (copy .env.example). See docs/LOCAL_DEV_MOCK.md.
# Optional ports (in .env or the environment): REDIS_PORT, MOCK_API_PORT, MOCK_WEB_PORT.
# They are passed explicitly because make does not export variables read from .env
# (API_PORT in .env is the compose stack's, so mock-up uses its own names).
MOCK_PORTS = REDIS_PORT="$(REDIS_PORT)" MOCK_API_PORT="$(MOCK_API_PORT)" MOCK_WEB_PORT="$(MOCK_WEB_PORT)"

mock-up:
	@DEV_ADMIN_EMAIL="$(DEV_ADMIN_EMAIL)" REDIS_DB_SECRET="$(REDIS_DB_SECRET)" $(MOCK_PORTS) scripts/mock.sh up

mock-down:
	@$(MOCK_PORTS) scripts/mock.sh down

mock-reset:
	@$(MOCK_PORTS) scripts/mock.sh reset

dev-local:
	@bash -c '\
	echo "Starting services locally..."; \
	echo "Checking ports..."; \
	if lsof -Pi :8000 -sTCP:LISTEN -t >/dev/null 2>&1 ; then \
		echo ""; \
		echo "⚠️  Port 8000 is already in use:"; \
		lsof -Pi :8000 -sTCP:LISTEN ; \
		read -p "Kill process on port 8000? [y/N] " -n 1 reply; \
		echo ""; \
		if [[ "$$reply" =~ ^[Yy]$$ ]] ; then \
			lsof -Pi :8000 -sTCP:LISTEN -t | xargs kill -9; \
			echo "✓ Killed process on port 8000"; \
		else \
			echo "Aborted."; exit 1; \
		fi \
	fi; \
	if lsof -Pi :3000 -sTCP:LISTEN -t >/dev/null 2>&1 ; then \
		echo ""; \
		echo "⚠️  Port 3000 is already in use:"; \
		lsof -Pi :3000 -sTCP:LISTEN ; \
		read -p "Kill process on port 3000? [y/N] " -n 1 reply; \
		echo ""; \
		if [[ "$$reply" =~ ^[Yy]$$ ]] ; then \
			lsof -Pi :3000 -sTCP:LISTEN -t | xargs kill -9; \
			echo "✓ Killed process on port 3000"; \
		else \
			echo "Aborted."; exit 1; \
		fi \
	fi; \
	'
	@echo "1. Starting Redis and dbcron..."
	@# dev compose: Redis is published on 127.0.0.1:6379 for the host API (production publishes no Redis port)
	@docker compose -f docker-compose.dev.yml up -d redis dbcron
	@echo "2. Waiting for data to be loaded into Redis..."
	@sleep 5
	@echo "3. Starting API server..."
	@# Pass the root .env password (the one dev Redis was started with); dotenv in
	@# the API does not override it with api/.env.
	@cd api && $(if $(REDIS_DB_SECRET),REDIS_DB_SECRET="$(REDIS_DB_SECRET)") NODE_ENV=development npm run dev &
	@echo "4. Starting website dev server..."
	@cd website && REACT_APP_PROXY_SERVER="http://localhost:8000" npm run react

# Check both reverse-proxy templates (production HTTPS, development HTTP) with
# `nginx -t` inside the image, using a throwaway self-signed certificate.
proxy-check:
	@reverseProxy/check-config.sh

# Production preflight for `make docker`: nginx's HTTPS server cannot start
# without the certificate, and Redis must not use the example password.
# certbot makes /etc/letsencrypt/live readable by root only, so when the deploy
# user cannot look inside it the check runs in a throwaway container (as root,
# same mount as compose) using the reverse proxy's base image.
PROD_SERVER_NAME = $(or $(NGINX_SERVER_NAME),gradeview.eecs.berkeley.edu)
PROD_CERT_DIR = /etc/letsencrypt/live/$(PROD_SERVER_NAME)
PROXY_BASE_IMAGE = $(shell awk '/^FROM /{print $$2; exit}' reverseProxy/Dockerfile)

prod-check:
ifeq ($(strip $(REDIS_DB_SECRET)),change-me-local-only)
	@echo "REDIS_DB_SECRET in .env is still the example value from .env.example." >&2
	@echo "Set a random one first (docs/DEPLOY.md, section 3)." >&2
	@exit 1
endif
	@certs='test -s "$(PROD_CERT_DIR)/fullchain.pem" && test -s "$(PROD_CERT_DIR)/privkey.pem"'; \
	if sh -c "$$certs" 2>/dev/null; then exit 0; fi; \
	if [ -d /etc/letsencrypt/live ] && [ ! -x /etc/letsencrypt/live ] && \
	   docker run --rm --mount type=bind,src=/etc/letsencrypt,dst=/etc/letsencrypt,readonly \
	     --entrypoint sh "$(PROXY_BASE_IMAGE)" -c "$$certs"; then exit 0; fi; \
	echo "make docker starts the PRODUCTION stack (docker-compose.yml, HTTPS only), but" >&2; \
	echo "$(PROD_CERT_DIR)/fullchain.pem and privkey.pem were not found, so nginx would not start." >&2; \
	echo "  On a laptop: make dev-up (HTTP, docker-compose.dev.yml) or make mock-up (fake data)." >&2; \
	echo "  On the server: issue the first certificate, see docs/DEPLOY.md section 4." >&2; \
	exit 1

# website/package-lock.json is out of sync with package.json, so `npm ci` refuses
# and a plain `npm install` rewrites the tracked lockfile, so the next
# `git pull --ff-only` that touches it fails on the local change. --no-save
# installs without writing it (as scripts/mock.sh does).
docker: prod-check
	@cd website && npm install --no-save && npm run build
	@docker compose build
	@docker compose up -dV

logs:
	@echo "ensure your stack is running to view logs:"
	@echo
	@docker ps
	@echo
	@docker compose logs -f

dev-logs:
	@echo "ensure your dev stack is running to view logs:"
	@echo
	@docker ps
	@echo
	@docker compose -f docker-compose.dev.yml logs -f

clean-containers:
	@docker compose down
	@for container in `docker ps -aq` ; do \
		echo "\nRemoving container $${container} \n========================================== " ; \
		docker rm -f $${container} || exit 1 ; \
	done

clean-images:
	@for image in `docker images -aq` ; do \
		echo "Removing image $${image} \n==========================================\n " ; \
		/usr/local/bin/docker rmi -f $${image} || exit 1 ; \
	done

clean: clean-containers clean-images
	@rm -rf **/__pycache__
	@docker system prune

rebuild: clean docker
