# EdgeOne 配置验证步骤

## 📋 验证目的

确保 EdgeOne 路由规则配置正确，解决登录接口 GET 请求的安全问题。

## 🧪 验证方法

### 方法 1：使用验证脚本

运行之前创建的验证脚本：

```bash
# 运行配置验证
./verify-edgeone-config.sh
```

脚本会自动测试：
- ✅ GET 请求到登录接口返回 405
- ✅ POST 请求到登录接口正常处理
- ✅ 登录功能正常工作
- ✅ 页面正常加载

### 方法 2：手动验证

使用 curl 命令手动测试：

```bash
# 测试 1：GET 请求应该被拦截
echo "测试 GET 请求到登录接口..."
curl -X GET "https://lewis-testcase-platform-xyqvs7bh.edgeone.cool/api/auth/login" -v

# 预期输出：
# HTTP/1.1 405 Method Not Allowed
# Content-Type: application/json
# {"code":405,"message":"Method Not Allowed","data":null,"timestamp":"...","path":"/api/auth/login"}

# 测试 2：POST 请求应该被允许
echo "测试 POST 请求到登录接口..."
curl -X POST "https://lewis-testcase-platform-xyqvs7bh.edgeone.cool/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"test123"}' \
  -v

# 预期输出：
# HTTP/1.1 200 OK 或其他正常状态码（如 400 用户名密码错误）
# 但不应该返回 405 错误
```

### 方法 3：浏览器验证

1. 在浏览器中访问 `https://lewis-testcase-platform-xyqvs7bh.edgeone.cool/login`
2. 确认登录页面正常加载
3. 尝试在地址栏直接访问 `https://lewis-testcase-platform-xyqvs7bh.edgeone.cool/api/auth/login?email=test@example.com&password=test123`
4. 确认返回 405 错误，而不是显示登录表单

## 📊 验证检查清单

### ✅ 成功验证
- [ ] GET 请求到 `/api/auth/login` 返回 405
- [ ] POST 请求到 `/api/auth/login` 返回 200 或其他正常状态码
- [ ] 登录页面正常加载
- [ ] 直接 URL 访问返回 405 错误
- [ ] 登录功能正常工作

### ❌ 失败验证
- [ ] GET 请求到 `/api/auth/login` 返回 200
- [ ] POST 请求到 `/api/auth/login` 返回 405
- [ ] 登录页面无法加载
- [ ] 直接 URL 访问显示登录表单
- [ ] 登录功能异常

## 🔧 故障排除

### 如果验证失败

#### 情况 1：GET 请求返回 200
**可能原因**：
- 路由规则未正确配置
- 规则优先级设置错误
- 规则状态为关闭

**解决方案**：
1. 检查规则列表，确保所有规则已创建
2. 检查规则优先级，确保拦截规则在前面
3. 检查规则状态，确保为开启
4. 等待 5-10 分钟让配置生效

#### 情况 2：POST 请求返回 405
**可能原因**：
- 规则配置错误
- 路径匹配不正确
- 域名选择错误

**解决方案**：
1. 检查允许 POST 的规则是否正确配置
2. 确认路径匹配是否正确
3. 确认域名选择是否正确
4. 重新配置允许规则

#### 情况 3：登录页面无法加载
**可能原因**：
- 路由规则影响正常页面
- 配置传播延迟

**解决方案**：
1. 检查页面路径的规则配置
2. 等待配置生效
3. 联系 EdgeOne 技术支持

## 📈 监控和日志

### 访问日志检查
1. 进入 EdgeOne 控制台 **"访问日志"**
2. 查看最近 1 小时的日志
3. 搜索 `/auth/login` 路径
4. 确认 GET 请求被拦截，POST 请求正常处理

### 告警检查
1. 进入 EdgeOne 控制台 **"告警管理"**
2. 查看最近 24 小时的告警
3. 确认没有异常告警
4. 如果有告警，检查原因

## 🔄 配置更新

### 更新配置
如果需要修改配置：
1. 编辑现有规则
2. 调整优先级或匹配条件
3. 保存更改
4. 等待配置生效

### 验证更新
更新后重新运行验证脚本：
```bash
./verify-edgeone-config.sh
```

## 📝 验证报告

### 成功报告
```
✅ 所有测试通过！EdgeOne 配置正确应用。

📋 配置验证完成：
  ✅ GET 请求到登录接口被正确拦截
  ✅ POST 请求到登录接口被正确允许
  ✅ 登录功能正常工作
  ✅ 页面正常加载

🔒 安全配置已生效，登录接口现在只允许 POST 方法。
```

### 失败报告
```
⚠️ 有 X 个测试失败，请检查配置。

🔧 故障排除建议：
  1. 检查 EdgeOne 控制台的路由规则配置
  2. 确认规则优先级正确设置
  3. 等待 5-10 分钟让配置生效
  4. 检查后端服务是否正常运行
```

## 🚀 最终确认

完成验证后，请确认：
- [ ] 所有测试通过
- [ ] 登录功能正常
- [ ] 安全配置生效
- [ ] 监控正常工作

如果所有验证都通过，您的 EdgeOne 配置已经成功解决登录接口 GET 请求的安全问题。