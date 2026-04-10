#!/bin/bash

set -e

echo "🚀 启动生产环境..."

# 等待数据库启动
echo "⏳ 等待数据库启动..."
until nc -z postgres 5432; do
  echo "等待数据库连接..."
  sleep 2
done

echo "✅ 数据库已连接"

# 运行数据库迁移
echo "🔄 运行数据库迁移..."
npx prisma migrate deploy

# 生成 Prisma 客户端
echo "🔧 生成 Prisma 客户端..."
npx prisma generate

# 启动应用
echo "🎯 启动 NestJS 应用..."
exec node dist/src/main.js