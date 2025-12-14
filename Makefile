-include .env
.DEFAULT_GOAL := docker

init:
	@cd website && npm install
	@cd api && npm install
	@cd website/server && npm install
	@cd website && npm run build

dev-up:
	@docker compose -f docker-compose.dev.yml up -dV

dev-down:
	@docker compose -f docker-compose.dev.yml down

dev-local:
	@echo "Starting services locally..."
	@echo "Checking ports..."
	@if lsof -Pi :8000 -sTCP:LISTEN -t >/dev/null 2>&1 ; then \
		echo "\n⚠️  Port 8000 is already in use:" ; \
		lsof -Pi :8000 -sTCP:LISTEN ; \
		read -p "Kill process on port 8000? [y/N] " -n 1 -r ; \
		echo ; \
		if [[ $$REPLY =~ ^[Yy]$$ ]] ; then \
			lsof -Pi :8000 -sTCP:LISTEN -t | xargs kill -9 ; \
			echo "✓ Killed process on port 8000" ; \
		else \
			echo "Aborted." ; exit 1 ; \
		fi \
	fi
	@if lsof -Pi :3000 -sTCP:LISTEN -t >/dev/null 2>&1 ; then \
		echo "\n⚠️  Port 3000 is already in use:" ; \
		lsof -Pi :3000 -sTCP:LISTEN ; \
		read -p "Kill process on port 3000? [y/N] " -n 1 -r ; \
		echo ; \
		if [[ $$REPLY =~ ^[Yy]$$ ]] ; then \
			lsof -Pi :3000 -sTCP:LISTEN -t | xargs kill -9 ; \
			echo "✓ Killed process on port 3000" ; \
		else \
			echo "Aborted." ; exit 1 ; \
		fi \
	fi
	@echo "1. Starting Redis and dbcron..."
	@docker-compose up -d redis dbcron
	@echo "2. Waiting for data to be loaded into Redis..."
	@sleep 5
	@echo "3. Starting API server..."
	@cd api && NODE_ENV=development npm run dev &
	@echo "4. Starting website dev server..."
	@cd website && REACT_APP_PROXY_SERVER="http://localhost:8000" npm run react

docker:
	@cd website && npm install && npm run build
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
