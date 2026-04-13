FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache openssl

RUN corepack enable

COPY backend/package.json backend/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY backend/ .
# Railway / 生产使用 PostgreSQL schema（与 sqlite 开发 schema 分离）
RUN pnpm exec prisma generate --schema=./prisma/schema.prod.prisma
RUN pnpm build

RUN ls -la dist/ && echo "[build] dist OK"

RUN mkdir -p uploads && chmod +x start.sh

EXPOSE 3000

CMD ["/bin/sh", "start.sh"]