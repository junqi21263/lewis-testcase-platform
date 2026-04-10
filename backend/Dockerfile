FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache openssl

RUN corepack enable

# Build context is repo root; copy only backend/ contents into /app
COPY backend/package.json backend/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY backend/ .
RUN pnpm prisma:generate
RUN pnpm build

RUN mkdir -p uploads

EXPOSE 3000

CMD sh -c "npx prisma migrate deploy && node dist/main.js"
