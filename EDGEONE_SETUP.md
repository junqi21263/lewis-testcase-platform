# EdgeOne 安全配置指南

## 概述

本文档说明了如何为 AI 测试用例生成平台配置 EdgeOne 安全规则，特别是解决登录接口 GET 请求的安全问题。

## 问题背景

用户报告 `https://<your-frontend-domain>/login` 接口不应该是 GET 请求，存在安全风险。GET 请求会将参数暴露在 URL 中，可能导致敏感信息泄露。

## 解决方案

### 1. EdgeOne 路由规则配置

在 EdgeOne 控制台中配置以下路由规则：

#### 1.1 阻止 GET 请求到认证接口
```json
{
  "name": "Block GET requests to auth endpoints",
  "pattern": "/auth/*",
  "methods": ["GET"],
  "action": "block",
  "priority": 100,
  "response": {
    "status_code": 405,
    "body": "Method Not Allowed"
  }
}
```

#### 1.2 允许 POST 请求到登录接口
```json
{
  "name": "Allow only POST to login",
  "pattern": "/auth/login",
  "methods": ["POST"],
  "action": "allow",
  "priority": 200
}
```

#### 1.3 允许 POST 请求到注册接口
```json
{
  "name": "Allow only POST to register",
  "pattern": "/auth/register", 
  "methods": ["POST"],
  "action": "allow",
  "priority": 200
}
```

### 2. 安全头配置

在 EdgeOne 控制台中配置以下安全头：

#### 2.1 默认安全头
```
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
```

#### 2.2 认证接口特殊安全头
```
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
```

### 3. 后端安全增强

#### 3.1 HTTP 方法验证中间件

创建了一个全局中间件来验证 HTTP 方法：

```typescript
@Injectable()
export class MethodValidationMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const sensitivePaths = ['/auth/login', '/auth/register']
    const currentPath = req.path
    const method = req.method
    
    // 检查是否是敏感路径
    const isSensitivePath = sensitivePaths.some(path => currentPath.includes(path))
    
    if (isSensitivePath && method !== 'POST') {
      return res.status(405).json({
        code: 405,
        message: 'Method Not Allowed',
        data: null,
        timestamp: new Date().toISOString(),
        path: currentPath
      })
    }
    
    next()
  }
}
```

#### 3.2 装饰器方法验证

创建了自定义装饰器来验证特定端点的 HTTP 方法：

```typescript
export const Method = createParamDecorator(
  (options: MethodOptions, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest()
    const method = request.method
    
    if (!options.allowedMethods.includes(method)) {
      throw new HttpException(
        options.message || `Method ${method} not allowed for this endpoint`,
        HttpStatus.METHOD_NOT_ALLOWED
      )
    }
    
    return method
  }
)
```

## 部署步骤

### 1. 应用 EdgeOne 配置

1. 登录 EdgeOne / Pages **控制台**（入口见云服务商文档）
2. 进入 "路由规则" 或 "边缘规则"
3. 添加上述路由规则
4. 进入 "安全设置" -> "HTTP 头"
5. 添加上述安全头配置

### 2. 部署前端

```bash
# 运行部署脚本
./deploy-edgeone.sh

# 或者手动部署
cd frontend
npm run build
# 然后通过 EdgeOne 控制台上传 dist 目录
```

### 3. 验证配置

#### 3.1 测试 GET 请求被拒绝
```bash
curl -X GET "https://<your-frontend-domain>/api/auth/login"
```
预期响应：405 Method Not Allowed

#### 3.2 测试 POST 请求被允许
```bash
curl -X POST "https://<your-frontend-domain>/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.invalid","password":"<占位-勿用真实口令>"}'
```
预期响应：正常处理（可能是错误信息，但不会是 405）

## 监控和日志

### 1. 启用访问日志
在 EdgeOne 控制台中启用访问日志，监控：
- GET 请求到认证接口的拦截情况
- POST 请求的成功率
- 异常请求的来源

### 2. 设置告警
设置以下告警：
- 大量 GET 请求到认证接口
- 异常的 405 错误率
- 登录失败率异常增高

### 3. 定期审查
定期审查：
- 路由规则的有效性
- 安全头的配置
- 访问日志中的异常模式

## 配置文件

项目包含了以下配置文件：

- `edgeone-rules.json` - EdgeOne 路由规则配置
- `edgeone-config.yaml` - EdgeOne 完整配置
- `edgeone-security-headers.json` - 安全头配置
- `deploy-edgeone.sh` - 部署脚本
- `EDGEONE_SETUP.md` - 本文档

## 故障排除

### 1. 配置不生效
- 检查路由规则的优先级设置
- 确认规则已启用
- 等待配置传播（可能需要几分钟）

### 2. 登录功能异常
- 检查 POST 请求是否被正确允许
- 确认安全头没有阻止正常请求
- 检查 CORS 配置

### 3. 性能问题
- 检查缓存规则配置
- 优化安全头设置
- 监控响应时间

## 安全建议

1. **定期更新密码策略**
2. **启用双因素认证**
3. **监控异常登录尝试**
4. **定期审查访问日志**
5. **保持 EdgeOne 规则更新**

## 联系支持

如果遇到问题，请：
1. 检查 EdgeOne 控制台的错误日志
2. 查看浏览器开发者工具的网络请求
3. 联系 EdgeOne 技术支持