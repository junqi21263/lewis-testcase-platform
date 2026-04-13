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

# P3009：库中若存在「已开始但未成功」的初始迁移记录，migrate deploy 会拒绝执行。
# 启动前尝试将该迁移标为 rolled-back；若无失败记录或已应用成功，命令会失败，忽略即可（|| true）。
STUCK_INIT_MIGRATION=20250413120000_init_postgresql
if [ "${SKIP_PRISMA_MIGRATE_ON_START:-}" = "1" ]; then
  echo "[start] WARN: 已设置 SKIP_PRISMA_MIGRATE_ON_START=1，跳过 migrate（仅用于排查 502；生产请在库稳定后关掉并执行 migrate deploy）"
else
  echo "[start] prisma migrate resolve --rolled-back $STUCK_INIT_MIGRATION (best-effort for P3009)..."
  pnpm exec prisma migrate resolve --rolled-back "$STUCK_INIT_MIGRATION" --schema=./prisma/schema.prod.prisma || true

  echo "[start] Running prisma migrate deploy..."
  if ! pnpm exec prisma migrate deploy --schema=./prisma/schema.prod.prisma; then
    echo "[start] ERROR: prisma migrate deploy 失败。请检查 DATABASE_URL 是否指向本项目的 Postgres、网络是否互通、以及迁移历史（Logs 中 Prisma 报错原文）。"
    echo "[start] 临时排查：可设 Variables SKIP_PRISMA_MIGRATE_ON_START=1 重新部署，若 /api/health 恢复则说明问题在迁移/数据库。"
    exit 1
  fi
fi

echo "[start] Checking build output..."
ls -la dist/src/main.js || { echo "[start] ERROR: dist/src/main.js missing — build step may have failed"; exit 1; }

echo "[start] Starting NestJS app (PORT=${PORT:-3000})..."
exec node dist/src/main.js
