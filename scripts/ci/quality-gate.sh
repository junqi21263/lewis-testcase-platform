#!/bin/sh
set -eu

corepack enable
corepack prepare pnpm@10.33.0 --activate >/dev/null

pnpm -C backend install --frozen-lockfile
pnpm -C backend exec prisma generate --schema=./prisma/schema.prod.prisma
pnpm -C backend test
pnpm -C backend build

pnpm -C frontend install --frozen-lockfile
pnpm -C frontend test:unit
pnpm -C frontend build
