FROM node:20-alpine

WORKDIR /app

# Railway / 容器边缘转发需要监听所有接口（勿在平台 Variables 里设 HOST=localhost）
ENV HOST=0.0.0.0

RUN apk add --no-cache openssl

RUN corepack enable

COPY backend/package.json backend/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY backend/ .
# Railway / 生产使用 PostgreSQL schema（与 sqlite 开发 schema 分离）
RUN pnpm exec prisma generate --schema=./prisma/schema.prod.prisma
RUN pnpm build

RUN ls -la dist/ && echo "[build] dist OK"

RUN mkdir -p uploads && chmod +x start.sh migrate-release.sh

EXPOSE 3000

CMD ["/bin/sh", "start.sh"]