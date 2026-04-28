#!/usr/bin/env bash
# 本地「前后端联调」门禁：不启动服务，仅校验 Prisma + 后端构建 + 前端构建。
# 可选：导出 DATABASE_URL 指向本地 Postgres（与 prisma validate 一致）。
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export DATABASE_URL="${DATABASE_URL:-postgresql://postgres:postgres@127.0.0.1:5432/postgres}"

echo "[integration] ROOT=$ROOT"

cd "$ROOT/backend"
pnpm exec prisma validate --schema=./prisma/schema.prod.prisma
pnpm exec prisma generate --schema=./prisma/schema.prod.prisma
pnpm run build

cd "$ROOT/frontend"
pnpm run build

echo "[integration] OK — backend + frontend build passed"
