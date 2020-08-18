FROM node:12
WORKDIR /app

COPY package.json yarn.lock ./
RUN yarn install && yarn cache clean
COPY . .

CMD ["yarn", "start"]
