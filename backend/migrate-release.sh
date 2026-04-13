#!/bin/sh
set -e
# Railway preDeployCommand：在流量切到新版本前执行，失败则本次部署不会上线。
# 避免在 start.sh 里跑长时间 migrate 导致进程迟迟不监听 PORT → 502。

if [ -z "${DATABASE_URL:-}" ]; then
  echo "[predeploy] ERROR: DATABASE_URL 未设置"
  exit 1
fi

echo "[predeploy] Best-effort: clear stuck failed migrations (P3009)..."
sh ./prisma-resolve-stuck-migrations.sh

echo "[predeploy] prisma migrate deploy... ($(date -u +%Y-%m-%dT%H:%M:%SZ))"
pnpm exec prisma migrate deploy --schema=./prisma/schema.prod.prisma
echo "[predeploy] prisma migrate deploy 完成"
