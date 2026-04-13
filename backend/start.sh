#!/bin/sh
set -e

echo "[start] Running prisma migrate deploy..."
pnpm exec prisma migrate deploy --schema=./prisma/schema.prod.prisma

echo "[start] Checking build output..."
ls -la dist/src/main.js || { echo "[start] ERROR: dist/src/main.js missing — build step may have failed"; exit 1; }

echo "[start] Starting NestJS app..."
exec node dist/src/main.js
