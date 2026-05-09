# 前端（React + Vite）

仓库总览与全栈启动见 **[../README.md](../README.md)**。

## 常用命令

```bash
pnpm install
cp .env.example .env    # 开发常见：VITE_API_BASE_URL=/api 或 http://localhost:3000/api
pnpm dev                # http://localhost:5173
pnpm build
pnpm lint
```

## 测试与报告

```bash
pnpm test:unit                  # Vitest
pnpm test:ct                    # Playwright 组件测试
pnpm test:e2e                   # E2E（会先起 dev server）
pnpm allure:report              # 单测 + CT + E2E + 生成 Allure（需本机 JRE）
pnpm test:pw:install            # 安装浏览器（首次/升级 Playwright 后）
```

## 环境变量

| 变量 | 说明 |
|------|------|
| `VITE_API_BASE_URL` | API 基址，与后端 `globalPrefix` 一致；生产同源反代常用 `/api` |
| `VITE_APP_NAME` | 应用名称 |

详见 [docs/development/ENVIRONMENT_VARIABLES.md](../docs/development/ENVIRONMENT_VARIABLES.md)。

## 部署说明

生产默认随仓库根目录 **`docker-compose.full.yml`**（Nginx 反代 + 静态资源）。单独构建静态资源：`pnpm build`，产物在 `dist/`。

Playwright Agent 定义见 `.github/agents/`。
