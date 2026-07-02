FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --legacy-peer-deps
COPY . .
EXPOSE 3000
CMD ["node_modules/.bin/ts-node", "--transpile-only", "src/main.ts"]
