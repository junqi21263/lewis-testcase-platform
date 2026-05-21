# 默认 Docker Hub node:20-alpine（CNB/大陆访问 public.ecr.aws 易 TLS 超时）。
# 海外若 docker.io 不通：docker build --build-arg NODE_IMAGE=public.ecr.aws/docker/library/node:20-alpine ...
#
# 多阶段：编译期安装 build-base/gcc（153+ 包、极慢）；运行期仅装 cairo/pango 等 runtime .so（几十包、通常分钟级），
# 避免每次部署都在同一层「卡在 gcc」。canvas 在 builder 内编译后随 node_modules 拷入 runner。

ARG NODE_IMAGE=node:20-alpine

# ---------- build canvas + Nest ----------
FROM ${NODE_IMAGE} AS builder

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
# postinstall 会 prisma generate，但此时尚未 COPY prisma/；忽略脚本后由下一步显式 generate + rebuild canvas
RUN pnpm install --frozen-lockfile --prod=false --prefer-offline=false --ignore-scripts

COPY backend/ .

RUN pnpm exec prisma generate --schema=./prisma/schema.prod.prisma

# canvas 须为直接依赖（pnpm 才会链接到根 node_modules）；install 脚本被 --ignore-scripts 跳过，此处显式编译
RUN echo "=== [backend builder] rebuild native canvas ===" && \
  pnpm rebuild canvas && \
  node -e "const p=require.resolve('canvas'); require(p); console.log('[build] canvas native OK:', p)"

RUN set -o pipefail && pnpm build 2>&1 | tee build.log

RUN ls -la dist/src/main.js && echo "[build] dist OK"

# 去掉 devDependencies，显著缩小推送到 GHCR / 国内仓的镜像体积（prisma 已在 dependencies 供 migrate deploy）
RUN pnpm prune --prod

# ---------- runtime：无 gcc；canvas 仅依赖动态库 ----------
FROM ${NODE_IMAGE} AS runner

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
    bash \
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
COPY --from=builder /app/scripts/lightweight-cloud-cleanup.sh ./scripts/lightweight-cloud-cleanup.sh

RUN chmod +x start.sh migrate-release.sh prisma-resolve-stuck-migrations.sh scripts/lightweight-cloud-cleanup.sh

# pdfkit 需独立 OTF（.ttc 集合字体会导致 fontkit 嵌入失败）。仓库内文件名为 NotoSansCJKsc-*（非旧名 NotoSansSC-*）
ARG FONT_DOWNLOAD_TIMEOUT=20
ARG FONT_DOWNLOAD_RETRIES=2
RUN apk add --no-cache wget ca-certificates \
  && mkdir -p /app/fonts \
  && fetch_font() { \
    target="$1"; \
    shift; \
    for url in "$@"; do \
      echo "[backend runner] fetching $(basename "$target") from $url"; \
      if wget -T "$FONT_DOWNLOAD_TIMEOUT" -t "$FONT_DOWNLOAD_RETRIES" -qO "${target}.part" "$url"; then \
        mv "${target}.part" "$target"; \
        return 0; \
      fi; \
      rm -f "${target}.part"; \
      echo "[backend runner] font fetch failed: $url"; \
    done; \
    echo "[backend runner] failed to download $(basename "$target") from all mirrors" >&2; \
    exit 1; \
  }; \
  fetch_font /app/fonts/NotoSansSC-Regular.otf \
    "https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/OTF/SimplifiedChinese/NotoSansCJKsc-Regular.otf" \
    "https://cdn.jsdelivr.net/gh/notofonts/noto-cjk@main/Sans/OTF/SimplifiedChinese/NotoSansCJKsc-Regular.otf" \
    "https://ghfast.top/https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/OTF/SimplifiedChinese/NotoSansCJKsc-Regular.otf" \
  && fetch_font /app/fonts/NotoSansSC-Bold.otf \
    "https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/OTF/SimplifiedChinese/NotoSansCJKsc-Bold.otf" \
    "https://cdn.jsdelivr.net/gh/notofonts/noto-cjk@main/Sans/OTF/SimplifiedChinese/NotoSansCJKsc-Bold.otf" \
    "https://ghfast.top/https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/OTF/SimplifiedChinese/NotoSansCJKsc-Bold.otf"

ENV ANALYSIS_REPORT_PDF_FONT_REGULAR=/app/fonts/NotoSansSC-Regular.otf \
    ANALYSIS_REPORT_PDF_FONT_BOLD=/app/fonts/NotoSansSC-Bold.otf

RUN mkdir -p uploads

EXPOSE 3000

CMD ["/bin/sh", "start.sh"]
