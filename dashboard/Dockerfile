FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci

# URL pública do gateway, embutida no bundle (acessada pelo navegador do operador).
ARG NEXT_PUBLIC_GATEWAY_URL=http://localhost:3000
ENV NEXT_PUBLIC_GATEWAY_URL=$NEXT_PUBLIC_GATEWAY_URL

COPY . .
RUN npm run build
EXPOSE 3002
CMD ["npm", "run", "start", "--", "-p", "3002"]
