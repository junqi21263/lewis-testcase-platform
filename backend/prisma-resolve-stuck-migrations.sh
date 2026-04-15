#!/bin/sh
# Prisma P3009：_prisma_migrations 里存在「已开始但失败」的记录时，migrate deploy 会拒绝继续。
#
# 默认不在每次部署时改动迁移历史（避免误操作）。
#
# 自救 A — 该次迁移应视为失败、需要让 Prisma 允许再次执行迁移 SQL 时，在 Railway Variables
# 临时设置（逗号分隔、无空格），重新部署一次，成功后删除变量：
#   PRISMA_RESOLVE_ROLLED_BACK=20260415193000_generation_record_extended_audit_share_export
#
# 自救 B — 迁移 SQL 实际已在库里执行完，仅 _prisma_migrations 仍标记为失败时：
#   PRISMA_RESOLVE_APPLIED=20260415193000_generation_record_extended_audit_share_export
#
# 不要对同一条迁移同时设置 ROLLED_BACK 与 APPLIED。
# 说明：https://pris.ly/d/migrate-resolve

set -e
SCHEMA="${PRISMA_SCHEMA:-./prisma/schema.prod.prisma}"

resolve_rolled_back() {
  name="$1"
  echo "[prisma-resolve-stuck] migrate resolve --rolled-back $name (best-effort)..."
  pnpm exec prisma migrate resolve --rolled-back "$name" --schema="$SCHEMA" || true
}

resolve_applied() {
  name="$1"
  echo "[prisma-resolve-stuck] migrate resolve --applied $name (best-effort)..."
  pnpm exec prisma migrate resolve --applied "$name" --schema="$SCHEMA" || true
}

if [ -n "${PRISMA_RESOLVE_ROLLED_BACK:-}" ]; then
  echo "[prisma-resolve-stuck] 处理 PRISMA_RESOLVE_ROLLED_BACK=$PRISMA_RESOLVE_ROLLED_BACK"
  OLD_IFS="$IFS"
  IFS=','
  for name in $PRISMA_RESOLVE_ROLLED_BACK; do
    IFS="$OLD_IFS"
    [ -z "$name" ] && continue
    resolve_rolled_back "$name"
    IFS=','
  done
  IFS="$OLD_IFS"
fi

if [ -n "${PRISMA_RESOLVE_APPLIED:-}" ]; then
  echo "[prisma-resolve-stuck] 处理 PRISMA_RESOLVE_APPLIED=$PRISMA_RESOLVE_APPLIED"
  OLD_IFS="$IFS"
  IFS=','
  for name in $PRISMA_RESOLVE_APPLIED; do
    IFS="$OLD_IFS"
    [ -z "$name" ] && continue
    resolve_applied "$name"
    IFS=','
  done
  IFS="$OLD_IFS"
fi

if [ -z "${PRISMA_RESOLVE_ROLLED_BACK:-}" ] && [ -z "${PRISMA_RESOLVE_APPLIED:-}" ]; then
  echo "[prisma-resolve-stuck] 未设置 PRISMA_RESOLVE_ROLLED_BACK / PRISMA_RESOLVE_APPLIED，跳过（正常部署）。"
fi
