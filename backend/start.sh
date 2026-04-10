#!/bin/sh
set -e

echo "[start] Running prisma migrate deploy..."
npx prisma migrate deploy

echo "[start] Checking dist/main.js..."
ls -la /app/dist/

echo "[start] Starting NestJS app..."
exec node dist/main.js
