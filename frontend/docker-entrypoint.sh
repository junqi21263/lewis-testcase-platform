#!/bin/sh
set -e
# Railway / 等平台会注入 PORT；VPS compose 仅映射 80 时可不设，默认 80。
# BACKEND_HOST：nginx 反代上游主机名，Compose 服务名一般为 backend；勿写死 IP。
export PORT="${PORT:-80}"
export BACKEND_HOST="${BACKEND_HOST:-backend}"
envsubst '${PORT} ${BACKEND_HOST}' < /etc/nginx/nginx.conf.template > /etc/nginx/nginx.conf
exec nginx -g "daemon off;"
