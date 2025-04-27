FROM node:21.2.0-alpine3.18
WORKDIR /website
COPY package*.json /website
RUN npm ci
COPY . /website
CMD ["npm", "run", "react"]
