#!/bin/bash

# 健康检查脚本
# 用于 Docker 容器的健康检查

set -e

echo "🏥 开始健康检查..."

# 检查数据库连接
echo "🗄️ 检查数据库连接..."
if ! nc -z postgres 5432; then
  echo "❌ 数据库连接失败"
  exit 1
fi

# 检查应用是否运行
echo "🚀 检查应用状态..."
if ! curl -f http://localhost:3000/api/health > /dev/null 2>&1; then
  echo "❌ 应用健康检查失败"
  exit 1
fi

echo "✅ 所有健康检查通过"