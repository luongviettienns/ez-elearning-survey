FROM node:20-alpine

WORKDIR /app

# Zero external npm dependencies: không cần npm install
ENV NODE_ENV=production \
    PORT=3000 \
    DATA_DIR=/app/data

COPY package.json ./
COPY server.mjs ./
COPY public ./public

RUN mkdir -p /app/data

EXPOSE 3000

CMD ["node", "server.mjs"]
