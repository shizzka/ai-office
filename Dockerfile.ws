FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY worker/ ./worker/
COPY data/ ./data/
EXPOSE 3101
CMD ["node", "worker/ws-server.js"]
