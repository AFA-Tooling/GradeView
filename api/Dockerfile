FROM node:20-alpine3.17
WORKDIR /api
ENV PATH="./node_modules/.bin:$PATH"
COPY package*.json ./
RUN npm ci
COPY . .
CMD ["node", "server.js"]