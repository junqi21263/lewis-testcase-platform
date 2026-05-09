# 分支与工作流

| 分支 | 用途 | 部署目标 |
|------|------|----------|
| `develop` | 开发、联调、CI 试跑 | 开发/测试服务器（可选） |
| `main` | 稳定发布 | 生产（VPS / 自动部署） |

## 推荐流程

1. **开发**：`git checkout develop` → 提交 → `git push origin develop`
2. **本地全栈**：`cp docker-compose.full.env.example .env.development`，编辑后  
   `docker compose -f docker-compose.full.yml --env-file .env.development up -d`
3. **进生产**：Review 通过后合并 `develop` → `main`；推送 `main` 触发 `.github/workflows/deploy-vps.yml`（构建前端、rsync、`docker compose`、冒烟）。

## 环境模板

- **Compose 全栈（开发/生产）**：`docker-compose.full.env.example` → 复制为 `.env.development` 或 `.env`
- **本机前后端分离**：`backend/.env.example`、`frontend/.env.example`

**勿将真实密钥、密码、API Key 提交到 Git。**
