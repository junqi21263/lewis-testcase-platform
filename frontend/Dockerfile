# 与仓库根目录 backend 服务分离部署时使用（Railway Root Directory = frontend，或 VPS compose 中的 frontend 服务）。
# 构建期注入 Vite 环境变量（须以 VITE_ 前缀）；默认 /api 适用于同源反代（docker-compose.full / Nginx 同域）。
# Public ECR：与 main 一致，避免部分环境拉取 docker.io 失败
FROM public.ecr.aws/docker/library/node:20-alpine AS build

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

# 生产环境 API 基址（与 Nest globalPrefix 一致须以 /api 结尾）
# Railway 上前端与后端域名不同时，设为后端公网 + /api，并在后端 CORS_ORIGINS 中放行前端 Origin。
ARG VITE_API_BASE_URL=/api
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
ARG VITE_APP_NAME=
ENV VITE_APP_NAME=${VITE_APP_NAME}

COPY . .

# CI 已 pnpm build 时存在 dist/：跳过镜像内 pnpm install（与 workflow「先本地构建再 docker build」配套）。
# 无 dist 时（本地 docker build）：完整 install + build。
RUN if [ -f dist/index.html ]; then \
      echo "[frontend-docker] using existing dist/ (from CI or host)"; \
    else \
      echo "[frontend-docker] running pnpm install + build in container"; \
      pnpm install --frozen-lockfile && \
      pnpm run build; \
    fi

FROM public.ecr.aws/docker/library/nginx:alpine

# 与 backend/Dockerfile 相同策略：默认官方 CDN；国内慢时 compose 传 APK_MIRROR
ARG APK_MIRROR=
RUN set -eux; \
  if [ -n "$APK_MIRROR" ]; then \
    echo "[frontend/nginx] APK_MIRROR=$APK_MIRROR"; \
    sed -i "s/dl-cdn.alpinelinux.org/${APK_MIRROR}/g" /etc/apk/repositories; \
  fi; \
  apk add --no-cache gettext

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf.template /etc/nginx/nginx.conf.template
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

EXPOSE 80

ENTRYPOINT ["/docker-entrypoint.sh"]
