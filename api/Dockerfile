# Node 22 LTS (the version the team runs locally), pinned to an exact Alpine tag.
FROM node:22.23.3-alpine3.24 AS base
WORKDIR /api
ENV PATH="./node_modules/.bin:$PATH"
COPY package*.json ./

# Development image: docker-compose.dev.yml builds this target and runs `npm run dev`
# (nodemon), so it keeps the dev dependencies (jest, nodemon, babel, ...).
FROM base AS dev
RUN npm ci && npm cache clean --force
COPY . .
CMD ["npm", "run", "dev"]

# Production image (the default, last stage; docker-compose.yml): runtime dependencies
# only, so dev tooling and its advisories are not shipped.
FROM base AS production
RUN npm ci --omit=dev && npm cache clean --force
COPY . .
CMD ["node", "server.js"]
