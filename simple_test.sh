#!/bin/bash

# 简化测试脚本

echo "开始执行简化自测计划..."

# 1. 启动后端服务
echo "启动后端服务..."
cd backend
npm run start:dev
sleep 5

# 2. 启动前端服务
echo "启动前端服务..."
cd ../frontend
npm run dev
sleep 5

# 3. 测试用户注册
echo "测试用户注册..."
curl -X POST http://localhost:5173/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","username":"testuser","password":"TestPass123"}'

# 4. 测试用户登录
echo "测试用户登录..."
curl -X POST http://localhost:5173/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","password":"TestPass123"}'

# 5. 测试密码重置
echo "测试密码重置..."
curl -X POST http://localhost:5173/api/auth/forgot-password \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com"}'

# 6. 测试重置密码
echo "测试重置密码..."
curl -X POST http://localhost:5173/api/auth/reset-password \
  -H "Content-Type: application/json" \
  -d '{"token":"test-token","newPassword":"NewPass123"}'

# 7. 测试忘记密码页面
echo "测试忘记密码页面..."
curl http://localhost:5173/forgot-password

# 8. 测试重置密码页面
echo "测试重置密码页面..."
curl http://localhost:5173/reset-password/test-token

# 9. 测试注册页面
echo "测试注册页面..."
curl http://localhost:5173/register

# 10. 测试登录页面
echo "测试登录页面..."
curl http://localhost:5173/login

# 11. 测试密码强度检查
echo "测试密码强度检查..."
curl -X POST http://localhost:5173/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","username":"testuser","password":"weak"}'

# 12. 测试密码强度检查（强密码）
echo "测试密码强度检查（强密码）..."
curl -X POST http://localhost:5173/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","username":"testuser","password":"StrongPass!123"}'

echo "简化测试完成！"
cd ../backend
npm run stop
cd ../frontend
npm run stop