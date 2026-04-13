#!/bin/sh
set -e

# Railway 上若此处失败，平台会报 502 / Application failed to respond，请先看本服务 Logs 里以 [start] 开头的行。

if [ -z "${DATABASE_URL:-}" ]; then
  echo "[start] ERROR: DATABASE_URL 未设置。请在 Railway 后端 Web 服务 Variables 中配置（可从 Postgres 服务 Reference 引用）。"
  exit 1
fi

if [ "${NODE_ENV:-}" = "production" ] && [ -z "${JWT_SECRET:-}" ]; then
  echo "[start] ERROR: NODE_ENV=production 但未设置 JWT_SECRET。请在 Variables 中添加 JWT_SECRET。"
  exit 1
fi

# Railway：migrate 在 railway.json → preDeployCommand（migrate-release.sh）中执行，此处尽快启动 Node 以免健康检查 502。
# 本地 / Docker Compose：无 RAILWAY_ENVIRONMENT 时仍在启动时执行 migrate。
# 强制在本容器内再跑一遍迁移：设置 RAILWAY_MIGRATE_ON_START=1；完全跳过：SKIP_PRISMA_MIGRATE_ON_START=1

STUCK_INIT_MIGRATION=20250413120000_init_postgresql
RUN_MIGRATE_AT_START=1
if [ -n "${RAILWAY_ENVIRONMENT:-}" ] && [ "${RAILWAY_MIGRATE_ON_START:-}" != "1" ]; then
  RUN_MIGRATE_AT_START=0
  echo "[start] Railway：跳过启动时 migrate（已由 preDeployCommand 执行）。调试可设 RAILWAY_MIGRATE_ON_START=1"
fi
if [ "${SKIP_PRISMA_MIGRATE_ON_START:-}" = "1" ]; then
  RUN_MIGRATE_AT_START=0
  echo "[start] WARN: SKIP_PRISMA_MIGRATE_ON_START=1，跳过 migrate"
fi

if [ "$RUN_MIGRATE_AT_START" = "1" ]; then
  echo "[start] prisma migrate resolve --rolled-back $STUCK_INIT_MIGRATION (best-effort for P3009)..."
  pnpm exec prisma migrate resolve --rolled-back "$STUCK_INIT_MIGRATION" --schema=./prisma/schema.prod.prisma || true

  echo "[start] Running prisma migrate deploy... ($(date -u +%Y-%m-%dT%H:%M:%SZ))"
  if ! pnpm exec prisma migrate deploy --schema=./prisma/schema.prod.prisma; then
    echo "[start] ERROR: prisma migrate deploy 失败。请检查 DATABASE_URL 与迁移历史。"
    exit 1
  fi
  echo "[start] prisma migrate deploy 完成 ($(date -u +%Y-%m-%dT%H:%M:%SZ))"
fi

echo "[start] Checking build output..."
ls -la dist/src/main.js || { echo "[start] ERROR: dist/src/main.js missing — build step may have failed"; exit 1; }

# Railway 边缘转发到「容器内端口」，须与 process.listen 一致；且必须监听 0.0.0.0，不能是 127.0.0.1
if [ -n "${RAILWAY_ENVIRONMENT:-}" ]; then
  export HOST=0.0.0.0
  echo "[start] Railway: 已设置 HOST=0.0.0.0（若 Variables 里曾设 HOST=localhost 会导致外网 502）"
  echo "[start] Railway: 将监听的 PORT=${PORT:-未设置，将用 3000} — 请与 Networking 里「转发到端口」一致"
fi

echo "[start] Starting NestJS app (HOST=${HOST:-0.0.0.0} PORT=${PORT:-3000})..."
exec node dist/src/main.js
