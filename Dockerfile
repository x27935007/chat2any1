FROM node:18-alpine

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

EXPOSE 3098

ENV PORT=3098
ENV NODE_ENV=production

CMD ["node", "server.js"]