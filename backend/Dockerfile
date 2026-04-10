FROM node:20-alpine AS builder

WORKDIR /app

RUN apk add --no-cache openssl

RUN corepack enable

# Build context is repo root; copy only backend/ contents into /app
COPY backend/package.json backend/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY backend/ .
RUN pnpm prisma:generate
RUN pnpm build

# ---- Production image ----
FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache openssl

RUN corepack enable

COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma

RUN mkdir -p uploads

EXPOSE 3000

CMD sh -c "npx prisma migrate deploy && node dist/main.js"
