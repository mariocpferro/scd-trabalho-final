FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
CMD ["node_modules/.bin/ts-node", "--transpile-only", "src/index.ts"]
