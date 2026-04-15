# 使用 Public ECR 上的 library 镜像，避免部分构建环境访问 docker.io（IPv6）时出现 network unreachable
FROM public.ecr.aws/docker/library/node:20-alpine

WORKDIR /app

# Railway / 容器边缘转发需要监听所有接口（勿在平台 Variables 里设 HOST=localhost）
ENV HOST=0.0.0.0

# openssl：Prisma；cairo/pango 等：node-canvas（pdf-to-img 将扫描版 PDF 首页渲成图再走视觉模型）
# fontconfig + CJK：pdf.js + node-canvas 渲染含中文/繁体 PDF 时常需系统字体，否则可能空白或异常
RUN apk add --no-cache \
  openssl \
  python3 \
  build-base \
  cairo-dev \
  jpeg-dev \
  pango-dev \
  musl-dev \
  giflib-dev \
  pixman-dev \
  pangomm-dev \
  libjpeg-turbo-dev \
  freetype-dev \
  fontconfig \
  font-noto-cjk

RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

COPY backend/package.json backend/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY backend/ .
# Railway / 生产使用 PostgreSQL schema（与 sqlite 开发 schema 分离）
RUN pnpm exec prisma generate --schema=./prisma/schema.prod.prisma
RUN pnpm build

RUN ls -la dist/ && echo "[build] dist OK"

RUN mkdir -p uploads && chmod +x start.sh migrate-release.sh prisma-resolve-stuck-migrations.sh

EXPOSE 3000

CMD ["/bin/sh", "start.sh"]