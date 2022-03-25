FROM node:16-alpine
ENV NODE_ENV production
ENV NODE_OPTIONS="--max-old-space-size=1024"
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm i --production=false
COPY . .
RUN npm run build
RUN npm prune --prod
EXPOSE 4000
