# AI 测试用例生成平台

基于 AI 的测试用例生成与文档解析平台：多格式上传、多模型调用、团队与权限、生成记录与导出。

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | React 18、TypeScript、Vite、Tailwind、Zustand、React Router |
| 后端 | NestJS、Prisma、PostgreSQL、JWT |
| 解析 | pdf-parse、xlsx、mammoth、tesseract.js 等 |

## 环境要求

- Node.js ≥ 18、pnpm ≥ 8（推荐 10）
- Docker / Docker Compose（本地或生产数据库与全栈）

## 快速开始

```bash
# 依赖
cd frontend && pnpm install
cd ../backend && pnpm install

# 环境变量
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
# 编辑 backend/.env：DATABASE_URL、JWT_SECRET、OPENAI_* 等

# 数据库（示例：仓库根目录 compose 仅 Postgres）
docker compose up -d

# 迁移与种子（与生产一致，使用 prod schema）
cd backend
pnpm exec prisma migrate deploy --schema=./prisma/schema.prod.prisma
pnpm exec prisma generate --schema=./prisma/schema.prod.prisma
pnpm prisma db seed

# 开发
pnpm start:dev          # 终端1，backend，默认 :3000
cd ../frontend && pnpm dev   # 终端2，:5173
```

浏览器打开 http://localhost:5173 。

**门禁（不启动服务）**：`bash scripts/dev-integration-check.sh`

## 前后端约定（联调）

| 项 | 说明 |
|----|------|
| API 前缀 | Nest 全局前缀 `api` → `http://localhost:3000/api/...` |
| 裸健康检查 | `GET /health` → 纯文本 `ok` |
| 业务健康检查 | `GET /api/health` → JSON |
| 前端 axios | `VITE_API_BASE_URL` 为空时开发环境常设为 `/api`，由 Vite 代理到后端 |

## 文档索引

| 文档 | 内容 |
|------|------|
| [docs/README.md](docs/README.md) | `docs/` 目录说明 |
| [docs/development/DEVELOPMENT.md](docs/development/DEVELOPMENT.md) | 研发说明 |
| [docs/development/GIT_WORKFLOW.md](docs/development/GIT_WORKFLOW.md) | 分支与发布流程 |
| [docs/development/ENVIRONMENT_VARIABLES.md](docs/development/ENVIRONMENT_VARIABLES.md) | 环境变量 |
| [docs/deployment/VPS_DOCKER.md](docs/deployment/VPS_DOCKER.md) | 自托管 Docker 全栈与 CI |
| [docs/development/QA_RELEASE_CHECKLIST.md](docs/development/QA_RELEASE_CHECKLIST.md) | 发布前自检 |
| [docs/development/ROADMAP.md](docs/development/ROADMAP.md) | 优化与迭代计划（存档） |
| [docs/history/MILESTONES.md](docs/history/MILESTONES.md) | 里程碑细述（存档） |
| [docs/qa/](docs/qa/) | 安全与质量报告 |
| [CHANGELOG.md](CHANGELOG.md) | 变更日志 |

## 仓库结构（摘要）

```
├── frontend/          # Web 前端
├── backend/           # Nest API
├── docker-compose.full.yml
├── docker-compose.full.env.example
├── scripts/           # smoke.sh、dev-integration-check.sh、CI 部署脚本
└── docs/              # 专题文档
```

## 默认账号

不在仓库中提供默认口令。本地请注册账号或通过 seed/运维流程创建管理员（见 `backend/.env.example` 中 `ADMIN_*` 说明）。

## 更新日志

见 [CHANGELOG.md](CHANGELOG.md)；里程碑叙事见 [docs/history/MILESTONES.md](docs/history/MILESTONES.md)。
