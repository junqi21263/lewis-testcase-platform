# 分支与工作流

| 分支 | 用途 | 部署目标 |
|------|------|----------|
| `develop` | 开发、联调、CI 试跑 | 开发/测试服务器（可选） |
| `main` | 稳定发布 | 生产（VPS / 自动部署） |

## 仓库唯一真源

- **唯一可开发、可部署的仓库**：`/Users/lewis/lewis_testcase_platform`
- **不要** 在仓库内部再放第二份 Git 仓库，也不要让 Cursor 打开历史嵌套副本。
- 2026-05-20 已将旧嵌套副本移出主仓库，归档到：
  - `/Users/lewis/repo-archives/lewis-testcase-platform-nested-archive-20260520`
- 以后凡是：
  - `git status`
  - `git push cnb develop`
  - `git push cnb main`
  - `pnpm build`
  - `docker compose`
  都只在顶层仓库执行。

## 推荐流程

1. **开发**：`git checkout develop` → 提交 → `git push cnb develop`
2. **本地全栈**：`cp docker-compose.full.env.example .env.development`，编辑后  
   `docker compose -f docker-compose.full.yml --env-file .env.development up -d`
3. **进生产**：确认 develop 验证通过后，同步到 `main` 并 `git push cnb main`
4. **VPS 发布**：不要在 VPS 上 `git push` 或手工改源码；VPS 只负责 `docker pull` 与 `docker compose up -d --force-recreate`

## 环境模板

- **Compose 全栈（开发/生产）**：`docker-compose.full.env.example` → 复制为 `.env.development` 或 `.env`
- **本机前后端分离**：`backend/.env.example`、`frontend/.env.example`

**勿将真实密钥、密码、API Key 提交到 Git。**
