#!/bin/sh
# Prisma P3009：_prisma_migrations 里存在「已开始但失败」的记录时，migrate deploy 会拒绝继续。
# 对下列迁移做 best-effort `migrate resolve --rolled-back`，清除失败标记后由 migrate deploy 重试。
#
# 若某迁移实际已在库中执行成功（仅 Prisma 状态错误），应改为一次性手动执行：
#   pnpm exec prisma migrate resolve --applied <迁移目录名> --schema=./prisma/schema.prod.prisma
#
# 若重试时报「type already exists」等，说明库已部分/全部应用该迁移，请用上面的 --applied。

set -e
SCHEMA="${PRISMA_SCHEMA:-./prisma/schema.prod.prisma}"

resolve_rolled_back() {
  name="$1"
  echo "[prisma-resolve-stuck] migrate resolve --rolled-back $name (best-effort)..."
  pnpm exec prisma migrate resolve --rolled-back "$name" --schema="$SCHEMA" || true
}

resolve_rolled_back 20250413120000_init_postgresql
resolve_rolled_back 20250414000000_add_role_enums
