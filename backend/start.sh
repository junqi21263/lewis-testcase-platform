#!/bin/sh
set -e

# P3009：库中若存在「已开始但未成功」的初始迁移记录，migrate deploy 会拒绝执行。
# 启动前尝试将该迁移标为 rolled-back；若无失败记录或已应用成功，命令会失败，忽略即可（|| true）。
STUCK_INIT_MIGRATION=20250413120000_init_postgresql
echo "[start] prisma migrate resolve --rolled-back $STUCK_INIT_MIGRATION (best-effort for P3009)..."
pnpm exec prisma migrate resolve --rolled-back "$STUCK_INIT_MIGRATION" --schema=./prisma/schema.prod.prisma || true

echo "[start] Running prisma migrate deploy..."
pnpm exec prisma migrate deploy --schema=./prisma/schema.prod.prisma

echo "[start] Checking build output..."
ls -la dist/src/main.js || { echo "[start] ERROR: dist/src/main.js missing — build step may have failed"; exit 1; }

echo "[start] Starting NestJS app..."
exec node dist/src/main.js
