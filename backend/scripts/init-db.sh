#!/bin/bash

set -e

echo "🗄️ 初始化数据库..."

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

# 如果需要，运行种子数据
if [ "$1" = "--seed" ]; then
  echo "🌱 运行种子数据..."
  npx prisma db seed
fi

echo "🎉 数据库初始化完成！"