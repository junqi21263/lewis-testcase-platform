# 发布前联调与自测清单

> 生产推荐路径：云服务器 + `docker-compose.full.yml`；合并 `main` 可走 GitHub Actions 自动部署。

## 1. 启动全栈

在已配置 `.env`（由 `docker-compose.full.env.example` 复制）的目录：

```bash
docker compose -f docker-compose.full.yml up -d --build
```

## 2. 健康检查（经 Nginx 80）

```bash
curl -fsS http://127.0.0.1/health && echo    # 纯文本 ok
curl -fsS http://127.0.0.1/api/health && echo # JSON
bash scripts/smoke.sh
```

## 3. UI 冒烟（建议）

- **登录**：用户名或邮箱 + 密码
- **生成**：上传 → 解析 → 生成（可开流式）；完成页：记录、分享、导出（Excel/Markdown/JSON/CSV）、复制 JSON
- **模板**：最近模板、模板页「去生成」带入
- **复用记录**：带入原文件（若记录关联文件）

## 4. 超级管理员（SUPER_ADMIN）

系统设置 → 超级管理员工具：查用户、重置密码、改角色；运维审计日志（无明文密码）。

## 5. 自动化测试与报告

- 门禁（不拉起服务）：`bash scripts/dev-integration-check.sh`
- 前端：`cd frontend && pnpm allure:report`（单测 + CT + E2E + Allure），见 `docs/qa/SECURITY_QA_REPORT_2026-05-09.md`
