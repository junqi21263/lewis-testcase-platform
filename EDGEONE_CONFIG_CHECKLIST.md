# EdgeOne 配置应用检查清单

## 📋 检查清单说明

使用此清单确保 EdgeOne 配置正确应用，解决登录接口 GET 请求的安全问题。

## 🔍 配置前准备

### 基本信息
- [ ] 已登录 EdgeOne / Pages 控制台（入口以云服务商文档为准，勿在仓库记录个人控制台直达链）
- [ ] 确认项目名称：`<your-project-name>`
- [ ] 确认项目 ID：`<your-pages-project-id>`
- [ ] 准备好管理员权限账号

### 环境检查
- [ ] 确认前端已部署到 EdgeOne
- [ ] 确认后端 API 正常运行
- [ ] 确认域名 `<your-frontend-domain>` 可访问

## 🛠️ 路由规则配置检查

### 规则 1：阻止 GET 请求到认证接口
- [ ] **规则名称**：`Block GET requests to auth endpoints`
- [ ] **优先级**：`100`
- [ ] **匹配模式**：`/auth/*`
- [ ] **HTTP 方法**：仅勾选 `GET`
- [ ] **动作**：`拦截` 或 `拒绝`
- [ ] **响应状态码**：`405`
- [ ] **响应内容**：`Method Not Allowed`

### 规则 2：允许 POST 请求到登录接口
- [ ] **规则名称**：`Allow only POST to login`
- [ ] **优先级**：`200`
- [ ] **匹配模式**：`/auth/login`
- [ ] **HTTP 方法**：仅勾选 `POST`
- [ ] **动作**：`允许`
- [ ] **响应状态码**：`200`
- [ ] **响应内容**：（留空）

### 规则 3：允许 POST 请求到注册接口
- [ ] **规则名称**：`Allow only POST to register`
- [ ] **优先级**：`200`
- [ ] **匹配模式**：`/auth/register`
- [ ] **HTTP 方法**：仅勾选 `POST`
- [ ] **动作**：`允许`
- [ ] **响应状态码**：`200`
- [ ] **响应内容**：（留空）

### 规则 4：允许认证接口的其他方法
- [ ] **规则名称**：`Allow auth API methods`
- [ ] **优先级**：`300`
- [ ] **匹配模式**：`/auth/*`
- [ ] **HTTP 方法**：勾选 `POST`、`PUT`、`PATCH`、`DELETE`、`GET`
- [ ] **动作**：`允许`
- [ ] **响应状态码**：`200`
- [ ] **响应内容**：（留空）

### 规则顺序验证
- [ ] 优先级 100 的规则排在第一位
- [ ] 优先级 200 的规则排在中间
- [ ] 优先级 300 的规则排在最后
- [ ] 所有规则状态为 `已启用`

## 🔒 安全头配置检查

### 默认安全头配置
- [ ] **X-Content-Type-Options**: `nosniff`
- [ ] **X-Frame-Options**: `DENY`
- [ ] **X-XSS-Protection**: `1; mode=block`
- [ ] **Strict-Transport-Security**: `max-age=31536000; includeSubDomains; preload`
- [ ] **Content-Security-Policy**: `default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'`
- [ ] **Referrer-Policy**: `strict-origin-when-cross-origin`
- [ ] **Permissions-Policy**: `camera=(), microphone=(), geolocation=()`

### 认证接口特殊安全头
- [ ] **路径**: `/auth/*`
- [ ] **Content-Security-Policy**: `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'`
- [ ] **X-Content-Type-Options**: `nosniff`
- [ ] **X-Frame-Options**: `DENY`
- [ ] **X-XSS-Protection**: `1; mode=block`
- [ ] **Strict-Transport-Security**: `max-age=31536000; includeSubDomains; preload`

## 📊 监控和日志配置检查

### 访问日志配置
- [ ] **访问日志功能**: 已启用
- [ ] **日志保留时间**: 至少 7 天
- [ ] **日志级别**: `INFO` 或 `DEBUG`
- [ ] **日志存储**: 已配置存储位置

### 告警规则配置
- [ ] **告警规则 1**: `Auth GET Requests Alert`
  - [ ] **触发条件**: `/auth/*` 路径的 GET 请求超过 100 次/分钟
  - [ ] **告警级别**: `警告`
  - [ ] **通知方式**: 邮件、短信
  - [ ] **告警状态**: 已启用

- [ ] **告警规则 2**: `405 Error Alert`
  - [ ] **触发条件**: 405 错误率超过 10%
  - [ ] **告警级别**: `严重`
  - [ ] **通知方式**: 邮件、短信、电话
  - [ ] **告警状态**: 已启用

## 🧪 功能测试检查

### GET 请求拦截测试
- [ ] **测试命令**:
  ```bash
  curl -X GET "https://<your-frontend-domain>/api/auth/login" -v
  ```
- [ ] **预期响应**: HTTP 405 Method Not Allowed
- [ ] **响应内容**: 包含 "Method Not Allowed"
- [ ] **测试时间**: 配置生效后 5-10 分钟

### POST 请求允许测试
- [ ] **测试命令**:
  ```bash
  curl -X POST "https://<your-frontend-domain>/api/auth/login" \
    -H "Content-Type: application/json" \
    -d '{"email":"user@example.invalid","password":"<占位-勿用真实口令>"}' \
    -v
  ```
- [ ] **预期响应**: HTTP 200 OK 或正常错误响应（非 405）
- [ ] **测试时间**: 配置生效后 5-10 分钟

### 浏览器访问测试
- [ ] **登录页面访问**: `https://<your-frontend-domain>/login`
  - [ ] 页面正常加载
  - [ ] 登录表单正常显示
  - [ ] 提交按钮正常工作

- [ ] **直接 URL 访问测试**: `https://<your-frontend-domain>/api/auth/login?email=user@example.invalid&password=<占位>`
  - [ ] 返回 405 错误
  - [ ] 不显示登录表单

### API 功能测试
- [ ] **用户注册**: POST `/auth/register` 正常工作
- [ ] **获取用户信息**: GET `/auth/profile` 正常工作（需要认证）
- [ ] **修改密码**: PATCH `/auth/profile` 正常工作（需要认证）

## 🔧 后端安全配置检查

### 中间件配置
- [ ] **MethodValidationMiddleware**: 已注册到应用模块
- [ ] **全局应用**: 中间件已应用到所有路由
- [ ] **敏感路径**: `/auth/login` 和 `/auth/register` 已正确配置

### 装饰器配置
- [ ] **Method 装饰器**: 已添加到登录和注册接口
- [ ] **错误消息**: 已配置明确的错误提示
- [ ] **HTTP 状态码**: 正确返回 405

## 📈 性能检查

### 响应时间
- [ ] **正常请求响应时间**: < 1 秒
- [ ] **错误请求响应时间**: < 500ms
- [ ] **页面加载时间**: < 3 秒

### 错误率
- [ ] **405 错误率**: < 5%（仅预期的拦截）
- [ ] **500 错误率**: < 1%
- [ ] **超时率**: < 1%

## 📝 文档和记录

### 配置文档
- [ ] **路由规则文档**: 已保存配置规则
- [ ] **安全头配置**: 已记录配置内容
- [ ] **测试报告**: 已记录测试结果

### 操作记录
- [ ] **配置变更记录**: 已记录配置变更时间和内容
- [ ] **测试记录**: 已记录测试时间和结果
- [ ] **问题记录**: 已记录发现的问题和解决方案

## ⚡ 快速验证步骤

### 1. 配置检查
- [ ] 所有路由规则已创建并启用
- [ ] 安全头已配置
- [ ] 监控和告警已设置

### 2. 功能验证
- [ ] GET 请求到登录接口返回 405
- [ ] POST 请求到登录接口正常处理
- [ ] 登录页面正常工作

### 3. 性能验证
- [ ] 响应时间正常
- [ ] 错误率在预期范围内
- [ ] 无性能下降

## 🚨 风险评估

### 高风险项目
- [ ] **登录功能完全失效**: 如果 POST 请求也被拦截
- [ ] **网站完全无法访问**: 如果配置错误导致所有请求被拦截
- [ ] **数据泄露**: 如果 GET 请求未被正确拦截

### 中等风险项目
- [ ] **用户体验下降**: 如果响应时间变长
- [ ] **功能部分异常**: 某些功能可能受影响
- [ ] **监控告警频繁**: 可能产生大量告警

### 低风险项目
- [ ] **日志量增加**: 记录更多拦截日志
- [ ] **配置复杂度**: 需要维护更多配置
- [ ] **学习成本**: 团队需要适应新配置

## 📞 紧急联系

如果遇到严重问题，请通过 **云服务商控制台工单 / 官方文档** 联系支持（勿在仓库文档中记录具体客服电话或内部联系人）。

---

## ✅ 完成确认

所有配置已正确应用和验证：

- [ ] 路由规则配置完成
- [ ] 安全头配置完成
- [ ] 监控和告警配置完成
- [ ] 功能测试通过
- [ ] 性能测试通过
- [ ] 文档记录完整

**配置完成时间**: _______________
**配置人员**: _______________
**审核人员**: _______________