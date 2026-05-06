# 与仓库根目录 backend 服务分离部署时使用（Railway Root Directory = frontend，或 VPS compose 中的 frontend 服务）。
# 构建期注入 Vite 环境变量（须以 VITE_ 前缀）；默认 /api 适用于同源反代（docker-compose.full / Nginx 同域）。
FROM node:20-alpine AS build

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .

# 生产环境 API 基址（与 Nest globalPrefix 一致须以 /api 结尾）
# Railway 上前端与后端域名不同时，设为后端公网 + /api，并在后端 CORS_ORIGINS 中放行前端 Origin。
ARG VITE_API_BASE_URL=/api
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
ARG VITE_APP_NAME=
ENV VITE_APP_NAME=${VITE_APP_NAME}

# GitHub Actions 等 CI 可先 pnpm build，rsync 到服务器后此处直接使用 dist，缩短云主机构建时间。
# 本地无 dist 时仍执行完整构建。
RUN if [ -f dist/index.html ]; then \
      echo "[frontend-docker] using existing dist/ (from CI or host)"; \
    else \
      echo "[frontend-docker] running pnpm build in container"; \
      pnpm run build; \
    fi

FROM nginx:alpine

RUN apk add --no-cache gettext

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf.template /etc/nginx/nginx.conf.template
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

EXPOSE 80

ENTRYPOINT ["/docker-entrypoint.sh"]
