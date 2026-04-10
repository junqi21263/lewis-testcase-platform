# EdgeOne 控制台配置指南

## 📋 概述

本指南详细说明如何在 EdgeOne 控制台中应用路由规则配置，解决登录接口 GET 请求的安全问题。

## 🔗 EdgeOne 控制台访问

1. **访问地址**：https://console.cloud.tencent.com/edgeone
2. **登录**：使用腾讯云账号登录
3. **选择项目**：选择 "lewis-testcase-platform" 项目

## 🛠️ 路由规则配置步骤

### 步骤 1：进入路由规则管理

1. 在左侧导航栏中找到 **"路由规则"** 或 **"边缘规则"** 菜单
2. 点击进入路由规则管理页面

### 步骤 2：创建路由规则

#### 2.1 阻止 GET 请求到认证接口

1. 点击 **"创建规则"** 或 **"添加规则"** 按钮
2. 填写规则信息：
   - **规则名称**：`Block GET requests to auth endpoints`
   - **优先级**：`100`（数值越小优先级越高）
   - **匹配模式**：`/auth/*`
   - **HTTP 方法**：勾选 `GET`
   - **动作**：选择 `拦截` 或 `拒绝`
   - **响应状态码**：`405`
   - **响应内容**：`Method Not Allowed`

3. 点击 **"确定"** 保存规则

#### 2.2 允许 POST 请求到登录接口

1. 再次点击 **"创建规则"**
2. 填写规则信息：
   - **规则名称**：`Allow only POST to login`
   - **优先级**：`200`
   - **匹配模式**：`/auth/login`
   - **HTTP 方法**：勾选 `POST`
   - **动作**：选择 `允许`
   - **响应状态码**：`200`
   - **响应内容**：（留空）

3. 点击 **"确定"** 保存规则

#### 2.3 允许 POST 请求到注册接口

1. 再次点击 **"创建规则"**
2. 填写规则信息：
   - **规则名称**：`Allow only POST to register`
   - **优先级**：`200`
   - **匹配模式**：`/auth/register`
   - **HTTP 方法**：勾选 `POST`
   - **动作**：选择 `允许`
   - **响应状态码**：`200`
   - **响应内容**：（留空）

3. 点击 **"确定"** 保存规则

#### 2.4 允许认证接口的其他方法

1. 再次点击 **"创建规则"**
2. 填写规则信息：
   - **规则名称**：`Allow auth API methods`
   - **优先级**：`300`
   - **匹配模式**：`/auth/*`
   - **HTTP 方法**：勾选 `POST`、`PUT`、`PATCH`、`DELETE`、`GET`
   - **动作**：选择 `允许`
   - **响应状态码**：`200`
   - **响应内容**：（留空）

3. 点击 **"确定"** 保存规则

### 步骤 3：验证规则配置

1. 查看规则列表，确认所有规则都已创建
2. 检查规则顺序是否正确：
   - 优先级 100 的规则应该在最前面
   - 优先级 200 的规则在中间
   - 优先级 300 的规则在最后面

## 🔒 安全头配置步骤

### 步骤 1：进入安全设置

1. 在左侧导航栏中找到 **"安全设置"** 菜单
2. 点击进入安全设置页面

### 步骤 2：配置默认安全头

1. 找到 **"HTTP 安全头"** 或 **"响应头"** 设置
2. 添加以下安全头：

#### 默认安全头配置：
```
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
```

3. 点击 **"保存"** 或 **"应用"** 按钮

### 步骤 3：配置认证接口特殊安全头

1. 找到 **"路径级安全头"** 或 **"按路径配置"** 选项
2. 为 `/auth/*` 路径添加特殊安全头：

#### 认证接口安全头配置：
```
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
```

3. 点击 **"保存"** 或 **"应用"** 按钮

## 📊 监控和日志配置

### 步骤 1：启用访问日志

1. 在左侧导航栏中找到 **"访问日志"** 菜单
2. 启用访问日志功能
3. 设置日志保留时间（建议 7 天）

### 步骤 2：设置告警规则

1. 在左侧导航栏中找到 **"告警管理"** 菜单
2. 创建以下告警规则：

#### 告警规则 1：大量 GET 请求到认证接口
- **告警名称**：`Auth GET Requests Alert`
- **触发条件**：`/auth/*` 路径的 GET 请求超过 100 次/分钟
- **告警级别**：`警告`
- **通知方式**：邮件、短信

#### 告警规则 2：异常 405 错误
- **告警名称**：`405 Error Alert`
- **触发条件**：405 错误率超过 10%
- **告警级别**：`严重`
- **通知方式**：邮件、短信、电话

## 🔄 配置验证步骤

### 步骤 1：等待配置生效

1. 配置完成后，等待 5-10 分钟让配置生效
2. EdgeOne 配置通常需要几分钟时间传播到所有边缘节点

### 步骤 2：测试 GET 请求被拒绝

使用 curl 命令测试：

```bash
# 测试 GET 请求到登录接口
curl -X GET "https://lewis-testcase-platform-xyqvs7bh.edgeone.cool/api/auth/login" -v

# 预期响应：
# HTTP/1.1 405 Method Not Allowed
# 内容应该包含 "Method Not Allowed"
```

### 步骤 3：测试 POST 请求被允许

```bash
# 测试 POST 请求到登录接口
curl -X POST "https://lewis-testcase-platform-xyqvs7bh.edgeone.cool/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"test123"}' \
  -v

# 预期响应：
# HTTP/1.1 200 OK 或正常的错误响应（如用户名密码错误）
# 但不应该返回 405 错误
```

### 步骤 4：测试浏览器访问

1. 在浏览器中访问 `https://lewis-testcase-platform-xyqvs7bh.edgeone.cool/login`
2. 尝试在浏览器地址栏直接访问 `https://lewis-testcase-platform-xyqvs7bh.edgeone.cool/api/auth/login?email=test@example.com&password=test123`
3. 确认登录表单正常工作

## 🔧 故障排除

### 常见问题 1：配置不生效

**解决方案**：
1. 检查规则优先级设置
2. 确认规则已启用
3. 等待 10-15 分钟让配置传播
4. 检查匹配模式是否正确

### 常见问题 2：登录功能异常

**解决方案**：
1. 检查 POST 请求是否被正确允许
2. 确认安全头没有阻止正常请求
3. 检查 CORS 配置
4. 查看访问日志排查问题

### 常见问题 3：性能问题

**解决方案**：
1. 检查缓存规则配置
2. 优化安全头设置
3. 监控响应时间
4. 联系 EdgeOne 技术支持

## 📝 配置检查清单

- [ ] 进入 EdgeOne 控制台
- [ ] 选择正确的项目
- [ ] 创建 4 个路由规则
- [ ] 设置正确的优先级
- [ ] 配置安全头
- [ ] 启用访问日志
- [ ] 设置告警规则
- [ ] 验证配置生效
- [ ] 测试 GET 请求被拒绝
- [ ] 测试 POST 请求被允许
- [ ] 测试浏览器访问

## 📞 技术支持

如果遇到问题，可以：
1. 查看 EdgeOne 控制台的错误日志
2. 联系腾讯云技术支持
3. 参考官方文档：https://cloud.tencent.com/document/product/1552

## ⚡ 快速配置脚本

如果 EdgeOne 支持 API 配置，可以使用以下脚本自动配置：

```bash
# 使用 curl 调用 EdgeOne API（需要 API 密钥）
curl -X POST "https://edgeone.tencentcloudapi.com/v1/rules" \
  -H "Authorization: Bearer YOUR_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d @edgeone-rules.json
```

注意：需要替换 `YOUR_API_TOKEN` 为实际的 API 密钥。