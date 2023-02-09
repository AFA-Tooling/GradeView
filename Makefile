.DEFAULT_GOAL := node

node:
	cd server
	npm start

docker:
	docker-compose build
	docker-compose up

build:
	cd website
	npm run build