#!/bin/sh
# Prisma P3009：_prisma_migrations 里存在「已开始但失败」的记录时，migrate deploy 会拒绝继续。
#
# 默认不在每次部署时改动迁移历史（避免误将已成功迁移标为 rolled-back）。
# 需要自救时在 Railway Variables 设置：
#   PRISMA_RESOLVE_ROLLED_BACK=20250414000000_add_role_enums,20260415193000_generation_record_extended_audit_share_export
# （逗号分隔，无空格）然后重新部署一次；成功后删除该变量。
#
# 若迁移实际已成功落库，仅 Prisma 状态错误，应使用：
#   pnpm exec prisma migrate resolve --applied <迁移目录名> --schema=./prisma/schema.prod.prisma

set -e
SCHEMA="${PRISMA_SCHEMA:-./prisma/schema.prod.prisma}"

resolve_rolled_back() {
  name="$1"
  echo "[prisma-resolve-stuck] migrate resolve --rolled-back $name (best-effort)..."
  pnpm exec prisma migrate resolve --rolled-back "$name" --schema="$SCHEMA" || true
}

if [ -z "${PRISMA_RESOLVE_ROLLED_BACK:-}" ]; then
  echo "[prisma-resolve-stuck] PRISMA_RESOLVE_ROLLED_BACK 未设置，跳过（正常部署）。"
  exit 0
fi

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
