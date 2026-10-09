# Node 22 LTS (the version the team runs locally), pinned to an exact Alpine tag.
FROM node:22.23.3-alpine3.24
WORKDIR /api
ENV PATH="./node_modules/.bin:$PATH"
COPY package*.json ./
# Dev dependencies stay: docker-compose.dev.yml runs `npm run dev` (nodemon).
RUN npm ci && npm cache clean --force
COPY . .
CMD ["node", "server.js"]
