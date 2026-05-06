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
RUN pnpm install --frozen-lockfile --prod=false --prefer-offline=false

COPY backend/ .
RUN ls -la && echo "[debug] backend files copied"
RUN ls -la src/ && echo "[debug] src directory contents"

RUN pnpm exec prisma generate --schema=./prisma/schema.prod.prisma && echo "[debug] prisma generate completed"

RUN pnpm exec nest --version && echo "[debug] nest CLI version"
RUN pnpm build 2>&1 | tee build.log && echo "[debug] build completed"
RUN cat build.log && echo "[debug] build log contents"

RUN ls -la dist/ && echo "[build] dist directory contents"
RUN ls -la dist/src/ 2>/dev/null || echo "[debug] dist/src does not exist"
RUN cat dist/src/main.js 2>/dev/null | head -20 || echo "[debug] main.js not found"

RUN mkdir -p uploads && chmod +x start.sh migrate-release.sh prisma-resolve-stuck-migrations.sh

EXPOSE 3000

CMD ["sh", "start.sh"]