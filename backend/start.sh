#!/bin/sh
set -e

# 若上次 deploy 留下 P3009（失败迁移记录），在 Railway 临时设置：
# PRISMA_MIGRATE_RESOLVE_ROLLED_BACK=20250413120000_init_postgresql
# 部署一次成功后删除该变量。
if [ -n "$PRISMA_MIGRATE_RESOLVE_ROLLED_BACK" ]; then
  echo "[start] prisma migrate resolve --rolled-back $PRISMA_MIGRATE_RESOLVE_ROLLED_BACK"
  pnpm exec prisma migrate resolve --rolled-back "$PRISMA_MIGRATE_RESOLVE_ROLLED_BACK" --schema=./prisma/schema.prod.prisma
fi

echo "[start] Running prisma migrate deploy..."
pnpm exec prisma migrate deploy --schema=./prisma/schema.prod.prisma

echo "[start] Checking build output..."
ls -la dist/src/main.js || { echo "[start] ERROR: dist/src/main.js missing — build step may have failed"; exit 1; }

echo "[start] Starting NestJS app..."
exec node dist/src/main.js
