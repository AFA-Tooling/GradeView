# Node 22 LTS (the version the team runs locally), pinned to an exact Alpine tag.
FROM node:22.23.3-alpine3.24
WORKDIR /website
ENV PATH="./node_modules/.bin:$PATH"
COPY package*.json ./
# Both compose files run `npm start` (node index.js); nodemon is not needed.
RUN npm ci --omit=dev && npm cache clean --force
COPY . .
CMD ["npm", "start"]
