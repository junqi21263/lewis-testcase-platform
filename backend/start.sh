#!/bin/sh
set -e

echo "[start] Running prisma migrate deploy..."
npx prisma migrate deploy --schema=./prisma/schema.prod.prisma

echo "[start] Listing dist/..."
ls -la /app/dist/

echo "[start] Starting NestJS app..."
exec node dist/src/main.js