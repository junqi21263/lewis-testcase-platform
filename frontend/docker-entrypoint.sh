#!/bin/sh
set -e
# Railway / 等平台会注入 PORT；VPS compose 仅映射 80 时可不设，默认 80。
export PORT="${PORT:-80}"
envsubst '${PORT}' < /etc/nginx/nginx.conf.template > /etc/nginx/nginx.conf
exec nginx -g "daemon off;"
