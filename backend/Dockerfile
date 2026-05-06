FROM node:20-alpine

WORKDIR /app

# Railway / 容器边缘转发需要监听所有接口（勿在平台 Variables 里设 HOST=localhost）
ENV HOST=0.0.0.0

# Alpine 镜像源：勿默认写死国内镜像 — 部分出口访问 mirrors.aliyun.com 会在 apk update 阶段长时间挂起。
# 使用官方 dl-cdn；国内构建慢时在 compose/.env 设置 APK_MIRROR=mirrors.aliyun.com（或 mirrors.tuna.tsinghua.edu.cn）。
# 勿单独 RUN apk update：`apk add --no-cache` 会拉取索引；单独 apk update 易在弱 mirror 上卡住且无日志。
ARG APK_MIRROR=
RUN set -eux; \
  if [ -n "$APK_MIRROR" ]; then \
    echo "[backend image] APK_MIRROR=$APK_MIRROR"; \
    sed -i "s/dl-cdn.alpinelinux.org/${APK_MIRROR}/g" /etc/apk/repositories; \
  else \
    echo "[backend image] Alpine APK: official CDN (set APK_MIRROR if downloads are slow)"; \
  fi

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

# 开发 compose 可传 INSTALL_CJK_FONTS=0 跳过 ~百 MB 的 font-noto-cjk，缩短弱网 VPS 首次构建
ARG INSTALL_CJK_FONTS=1
RUN echo "=== [backend image] apk: CJK fonts ===" && \
  if [ "$INSTALL_CJK_FONTS" = "1" ]; then \
    apk add --no-cache font-noto-cjk; \
  else \
    echo "[backend image] INSTALL_CJK_FONTS=0 — skipping font-noto-cjk (set INSTALL_CJK_FONTS=1 if PDF needs CJK glyphs)"; \
  fi

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
