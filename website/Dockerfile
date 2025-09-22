# ---- build client (Node 20 LTS or 21 OK) ----
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN --mount=type=cache,target=/root/.npm npm ci
COPY . .
# Your package.json build currently does:
#   react-scripts build && rm -rf server/build && mv build server
# That leaves assets at /app/server/build
ARG REACT_APP_PROXY_SERVER
ENV REACT_APP_PROXY_SERVER=$REACT_APP_PROXY_SERVER
RUN npm run build

# ---- runtime: server that serves the built client ----
FROM node:20-alpine
WORKDIR /website
# install server deps
COPY server/package*.json ./server/
RUN --mount=type=cache,target=/root/.npm npm ci --prefix server
# copy server code
COPY server/ ./server/
# place client build where server expects it: /website/build
COPY --from=builder /app/server/build ./server/build
ENV PORT=3000
EXPOSE 3000
CMD ["npm","start","--prefix","server"]
