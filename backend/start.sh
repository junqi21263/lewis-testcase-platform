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

# 启动时执行 prisma migrate deploy（幂等；与 preDeploy 重复执行无害）。
# 此前仅在非 Railway 或 RAILWAY_MIGRATE_ON_START=1 时执行，若平台未配置 preDeployCommand 会导致新列未落库（如 emailVerified）。
# 完全跳过迁移：SKIP_PRISMA_MIGRATE_ON_START=1

RUN_MIGRATE_AT_START=1
if [ "${SKIP_PRISMA_MIGRATE_ON_START:-}" = "1" ]; then
  RUN_MIGRATE_AT_START=0
  echo "[start] WARN: SKIP_PRISMA_MIGRATE_ON_START=1，跳过 migrate"
fi

if [ "$RUN_MIGRATE_AT_START" = "1" ]; then
  echo "[start] Best-effort: clear stuck failed migrations (P3009)..."
  sh ./prisma-resolve-stuck-migrations.sh

  echo "[start] Running prisma migrate deploy... ($(date -u +%Y-%m-%dT%H:%M:%SZ))"
  if ! pnpm exec prisma migrate deploy --schema=./prisma/schema.prod.prisma; then
    echo "[start] ERROR: prisma migrate deploy 失败。请检查 DATABASE_URL 与迁移历史。"
    echo "[start] 若日志为 P3009：在 Railway Variables 临时设置其一（无空格逗号列表），重部署后删除变量："
    echo "[start]   PRISMA_RESOLVE_ROLLED_BACK=20260415193000_generation_record_extended_audit_share_export  （需让 Prisma 再跑一次该迁移）"
    echo "[start]   或 PRISMA_RESOLVE_APPLIED=同上迁移名  （库结构已对齐，仅修正迁移状态）"
    echo "[start] 详见 https://pris.ly/d/migrate-resolve 与 backend/prisma-resolve-stuck-migrations.sh"
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
