FROM node:20-alpine AS builder

WORKDIR /app

RUN corepack enable

# Copy everything first, then install (avoids BuildKit cache key issues with pnpm-lock.yaml)
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm prisma:generate
RUN pnpm build

# ---- Production image ----
FROM node:20-alpine

WORKDIR /app

RUN corepack enable

COPY --from=builder /app/package.json ./
COPY --from=builder /app/pnpm-lock.yaml ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/prisma ./prisma

RUN mkdir -p uploads

EXPOSE 3000

CMD sh -c "npx prisma migrate deploy && node dist/main.js"
