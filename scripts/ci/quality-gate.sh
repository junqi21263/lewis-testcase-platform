#!/bin/sh
set -eu

if command -v corepack >/dev/null 2>&1; then
  corepack enable
  corepack prepare pnpm@10.33.0 --activate >/dev/null
  PNPM_CMD="pnpm"
else
  PNPM_CMD="npx pnpm@10.33.0"
fi

$PNPM_CMD -C backend install --frozen-lockfile
$PNPM_CMD -C backend exec prisma generate --schema=./prisma/schema.prod.prisma
$PNPM_CMD -C backend test
$PNPM_CMD -C backend build

$PNPM_CMD -C frontend install --frozen-lockfile
$PNPM_CMD -C frontend test:unit
$PNPM_CMD -C frontend build
