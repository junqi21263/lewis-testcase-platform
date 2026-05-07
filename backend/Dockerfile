# 使用 Public ECR 上的 library 镜像，避免部分构建环境访问 docker.io（IPv6）时出现 network unreachable（与 main 生产路径一致）
#
# 多阶段：编译期安装 build-base/gcc（153+ 包、极慢）；运行期仅装 cairo/pango 等 runtime .so（几十包、通常分钟级），
# 避免每次部署都在同一层「卡在 gcc」。canvas 在 builder 内编译后随 node_modules 拷入 runner。

# ---------- build canvas + Nest ----------
FROM public.ecr.aws/docker/library/node:20-alpine AS builder

WORKDIR /app

ENV HOST=0.0.0.0

ARG APK_MIRROR=
RUN set -eux; \
  if [ -n "$APK_MIRROR" ]; then \
    echo "[backend builder] APK_MIRROR=$APK_MIRROR"; \
    sed -i "s/dl-cdn.alpinelinux.org/${APK_MIRROR}/g" /etc/apk/repositories; \
  else \
    echo "[backend builder] Alpine APK: official CDN (set APK_MIRROR if slow)"; \
  fi

# 拆层便于日志区分：卡在「build-base」属正常，弱网可能需 10–20 分钟
RUN echo "=== [backend builder] apk: openssl + python3 (node-gyp) ===" && \
  apk add --no-cache openssl python3

RUN echo "=== [backend builder] apk: build-base (gcc toolchain — largest/slowest) ===" && \
  apk add --no-cache build-base

RUN echo "=== [backend builder] apk: cairo / pango (-dev) for node-canvas compile ===" && \
  apk add --no-cache \
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

RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

COPY backend/package.json backend/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod=false --prefer-offline=false

COPY backend/ .

RUN pnpm exec prisma generate --schema=./prisma/schema.prod.prisma

RUN set -o pipefail && pnpm build 2>&1 | tee build.log

RUN ls -la dist/src/main.js && echo "[build] dist OK"

# 去掉 devDependencies，显著缩小推送到 GHCR / 国内仓的镜像体积（prisma 已在 dependencies 供 migrate deploy）
RUN pnpm prune --prod

# ---------- runtime：无 gcc；canvas 仅依赖动态库 ----------
FROM public.ecr.aws/docker/library/node:20-alpine AS runner

WORKDIR /app

ENV HOST=0.0.0.0

ARG APK_MIRROR=
RUN set -eux; \
  if [ -n "$APK_MIRROR" ]; then \
    echo "[backend runner] APK_MIRROR=$APK_MIRROR"; \
    sed -i "s/dl-cdn.alpinelinux.org/${APK_MIRROR}/g" /etc/apk/repositories; \
  fi

RUN echo "=== [backend runner] apk: runtime libs for canvas + prisma ===" && \
  apk add --no-cache \
    openssl \
    cairo \
    pango \
    giflib \
    libjpeg-turbo \
    pixman \
    pangomm \
    libpng \
    freetype \
    harfbuzz \
    fontconfig \
    ttf-dejavu

ARG INSTALL_CJK_FONTS=1
RUN echo "=== [backend runner] apk: CJK fonts (PDF/canvas) ===" && \
  if [ "$INSTALL_CJK_FONTS" = "1" ]; then \
    apk add --no-cache font-noto-cjk; \
  else \
    echo "[backend runner] INSTALL_CJK_FONTS=0 — skipping font-noto-cjk"; \
  fi

RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/start.sh ./start.sh
COPY --from=builder /app/migrate-release.sh ./migrate-release.sh
COPY --from=builder /app/prisma-resolve-stuck-migrations.sh ./prisma-resolve-stuck-migrations.sh

RUN chmod +x start.sh migrate-release.sh prisma-resolve-stuck-migrations.sh

RUN mkdir -p uploads

EXPOSE 3000

CMD ["/bin/sh", "start.sh"]
