FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY . .
RUN npx next build
EXPOSE 3100
CMD ["npx", "next", "start", "-p", "3100"]
