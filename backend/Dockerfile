FROM node:20-alpine

WORKDIR /app

# Railway / 容器边缘转发需要监听所有接口（勿在平台 Variables 里设 HOST=localhost）
ENV HOST=0.0.0.0

# 多台 VPS 访问 dl-cdn.alpinelinux.org 极慢或超时，apk 长时间无输出易被误判为「卡死」
# 默认改用阿里云镜像（路径与官方一致）；若在境外构建可把下行注释掉或自建 ARG 切换
RUN set -eux; \
  sed -i 's/dl-cdn.alpinelinux.org/mirrors.aliyun.com/g' /etc/apk/repositories; \
  apk update

# openssl：Prisma；cairo/pango：node-canvas（pdf-to-img 渲染 PDF 首页）
# 拆成两步：日志可见进度；font-noto-cjk 体积大、单独一层便于缓存与排查
RUN echo "=== [backend image] apk: canvas / native deps ===" && \
  apk add --no-cache \
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
    fontconfig

RUN echo "=== [backend image] apk: CJK fonts (download may take several minutes on slow networks) ===" && \
  apk add --no-cache font-noto-cjk

RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

COPY backend/package.json backend/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod=false --prefer-offline=false

COPY backend/ .

RUN pnpm exec prisma generate --schema=./prisma/schema.prod.prisma

RUN set -o pipefail && pnpm build 2>&1 | tee build.log

RUN ls -la dist/src/main.js && echo "[build] dist OK"

RUN mkdir -p uploads && chmod +x start.sh migrate-release.sh prisma-resolve-stuck-migrations.sh

EXPOSE 3000

CMD ["sh", "start.sh"]
