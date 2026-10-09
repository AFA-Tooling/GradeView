# Node 22 LTS (the version the team runs locally), pinned to an exact Alpine tag.
FROM node:22.23.3-alpine3.24
WORKDIR /website
COPY package*.json /website/
RUN npm ci && npm cache clean --force
COPY . /website
CMD ["npm", "run", "react"]
