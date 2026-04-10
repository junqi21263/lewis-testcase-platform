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

# Verify build output
RUN ls -la dist/ && test -f dist/main.js && echo "[build] dist/main.js OK"

RUN mkdir -p uploads && chmod +x start.sh

EXPOSE 3000

CMD ["/bin/sh", "start.sh"]
