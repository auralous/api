FROM node:16-alpine
ENV NODE_ENV production
WORKDIR /usr/src/app
# Note: npm v7 is expected to support yarn.lock
COPY ["package.json", "yarn.lock", "./"]
RUN npm i --production=false
COPY . .
RUN npm run build
RUN npm prune --prod
EXPOSE 4000
CMD ["npm", "start"]
