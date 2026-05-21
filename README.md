# AI 测试用例生成平台

基于 **NestJS + React** 的全栈应用：上传多格式需求文档，经解析与多模型 AI 调用，完成 **需求分析、测试用例生成、记录与导出**；支持团队权限、模板与系统设置。生产数据库使用 **PostgreSQL**（Prisma `schema.prod.prisma`）。

## 仓库与远程

| 用途 | 说明 |
|------|------|
| **仓库名** | `lewis-testcase-platform` |
| **CNB（默认 CI/部署）** | 根目录 [`.cnb.yml`](.cnb.yml) 在推送 `develop` / `main` 时触发构建与 VPS 部署；日常开发验证优先推 **CNB 远程**（本环境 `origin` 常指向 CNB）。 |
| **GitHub（镜像 / 协作）** | <https://github.com/junqi21263/lewis-testcase-platform> |

```bash
# 仅克隆 GitHub
git clone https://github.com/junqi21263/lewis-testcase-platform.git
# 或 SSH
git clone git@github.com:junqi21263/lewis-testcase-platform.git

# 已有仓库时增加 GitHub 远程（名称可自定）
git remote add github https://github.com/junqi21263/lewis-testcase-platform.git
git push github develop
git push github main
```

CNB 命名空间与流水线配置说明见 [docs/cnb-migration.md](docs/cnb-migration.md)。

## 功能概览（与代码对齐）

| 模块 | 路径 / API 前缀 | 能力摘要 |
|------|-----------------|----------|
| **工作台** | `/dashboard` | 总览与快捷入口 |
| **AI 需求分析** | `/ai-analysis`（旧书签 `/upload` 会重定向至此），`POST /api/files/*`、`POST /api/ai/analyze/stream` | **上传**：单文件与分片上传，可选 **腾讯云 COS** 直传；PDF / Word / Excel / 图片等多格式解析与进度；**SSE 流式**结构化报告；Mermaid；**导出 XMind / PDF** |
| **生成用例** | `/generate`，`POST /api/ai/generate`、`/api/ai/generate/stream` | 非流式与 **SSE 流式**生成测试用例；模型列表 `GET /api/ai/models` |
| **生成记录** | `/records`，`/api/records` | 记录查询、分享、批量操作；Friendly 主题表格与筛选布局（2026-05 重构） |
| **模板管理** | `/templates`，`/api/templates` | 用例/提示模板维护 |
| **团队管理** | `/teams`，`/api/teams` | 团队与成员权限 |
| **系统设置** | `/settings`，`/api/settings` 等 | **AI 模型配置**；用户偏好；**天气城市**与**壁纸**（顶栏天气、全屏壁纸层，见 `WeatherBadge`、`WallpaperLayer`） |
| **认证** | `/api/auth` | 注册（邮箱+用户名+密码）、**登录（用户名+密码）**、忘记/重置密码；业务错误多为 **HTTP 200 + JSON `code`**（见 [CHANGELOG](CHANGELOG.md) 2026-04-13） |
| **管理员** | `/api/admin` | 运维与管理员能力（含模型连通性测试 `POST /api/ai/test` 等） |
| **文档解析记录** | `/api/document-parse` | 解析任务与记录接口 |

**健康检查**：`GET /health` 返回纯文本 `ok`；`GET /api/health` 返回 JSON；**`GET /api/health/cos`** 可诊断 COS 配置与 PutObject 探针（不返回密钥）。API 全局前缀为 **`/api`**（Swagger：`http://localhost:3000/api/docs`）。

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | React 18、TypeScript、Vite、Tailwind、Zustand、React Router |
| 后端 | NestJS、Prisma、PostgreSQL、JWT |
| 解析与多媒体 | pdf-parse、xlsx、mammoth、tesseract.js、多模态视觉管线等 |

## 环境要求

- Node.js ≥ 18、pnpm ≥ 8（推荐 10）
- Docker / Docker Compose（本地或生产数据库与全栈）

## 快速开始

```bash
cd frontend && pnpm install
cd ../backend && pnpm install

cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
# 编辑 backend/.env：DATABASE_URL、JWT_SECRET、OPENAI_* 等

docker compose up -d

cd backend
pnpm exec prisma migrate deploy --schema=./prisma/schema.prod.prisma
pnpm exec prisma generate --schema=./prisma/schema.prod.prisma
pnpm prisma db seed

pnpm start:dev
cd ../frontend && pnpm dev
```

浏览器打开 <http://localhost:5173>。前端开发可将 `VITE_API_BASE_URL` 设为 `/api`，由 Vite 代理到后端。

**不启动服务的自检**：`bash scripts/dev-integration-check.sh`

## 前后端约定

| 项 | 说明 |
|----|------|
| API 基址 | 生产常见同源反代 `/api`；开发见 `frontend/.env.example` |
| 业务错误 | 多数业务接口：**HTTP 200**，`code !== 0` 表示错误；成功为 **`code: 0`** |
| 裸健康检查 | `GET /health`（负载均衡 / 平台探活） |

## 解析与 AI 相关环境变量（摘要）

图片/PDF 解析、混元分页视觉、OCR 兜底、COS 与上传存储等，见 **`backend/.env.example`**（如 `HUNYUAN_*`、`FILE_PARSE_*`、`FILE_UPLOAD_STORAGE`、`COS_*`、`VISION_*`、`IMAGE_OCR_*`）。VPS 双环境 env 同步与 COS 签名排查见 [**VPS_GHCR_DUAL_ENV.md**](docs/deployment/VPS_GHCR_DUAL_ENV.md)。

## 文档索引

| 文档 | 内容 |
|------|------|
| [docs/README.md](docs/README.md) | `docs/` 目录说明 |
| [docs/development/DEVELOPMENT.md](docs/development/DEVELOPMENT.md) | 研发说明 |
| [docs/development/GIT_WORKFLOW.md](docs/development/GIT_WORKFLOW.md) | 分支与发布流程 |
| [docs/development/ENVIRONMENT_VARIABLES.md](docs/development/ENVIRONMENT_VARIABLES.md) | 环境变量 |
| [docs/deployment/VPS_DOCKER.md](docs/deployment/VPS_DOCKER.md) | 自托管 Docker 与 CI |
| [docs/deployment/VPS_GHCR_DUAL_ENV.md](docs/deployment/VPS_GHCR_DUAL_ENV.md) | VPS 双目录（dev/prod）环境变量同步、COS `env_file` 注入与 compose 命令 |
| [scripts/diagnose-cos-vps.sh](scripts/diagnose-cos-vps.sh) | VPS 上对比 env 文件与容器内 COS 变量（仅长度/后四位） |
| [docs/deployment/COMPOSE_FILES.md](docs/deployment/COMPOSE_FILES.md) | 根目录各 `docker-compose*.yml` |
| [docs/operations/VPS_RELEASE_RUNBOOK.md](docs/operations/VPS_RELEASE_RUNBOOK.md) | 当前实际使用的 VPS 发布命令手册 |
| [CHANGELOG.md](CHANGELOG.md) | 变更日志 |

## 仓库结构（摘要）

```
├── frontend/          # Web 前端（Vitest / Playwright 见 frontend/README.md）
├── backend/           # Nest API（Prisma `schema.prod.prisma` 为准）
├── docker-compose*.yml   # 全栈/依赖服务定义（路径与 build context 绑定根目录，勿随意挪目录）
├── docker-compose.full.env.example  # 全栈环境变量模板（勿删；复制为 .env / .env.development）
├── scripts/           # 本地检查、CI 部署脚本
└── docs/
```

**目录约定**：勿在仓库内再克隆一份同名子目录 `lewis-testcase-platform/`（易与 `.gitignore` 中已忽略的误拷副本混淆）；Playwright MCP 等产生的 `.playwright-mcp/` 已忽略，不必提交。根目录勿单独 `npm install`（前后端分别在 `frontend/`、`backend/` 使用 pnpm）。

## 默认账号

仓库不提供默认口令。本地请注册或通过 seed / `ADMIN_*` 等运维流程创建管理员（见 `backend/.env.example`）。

## 最近更新（2026-05-19）

- **生成记录**：Friendly 主题页布局与深色模式 token 优化。
- **PDF / 混元**：大文件分页多模态、忠实转录、OCR 多级兜底；Docker 内 `canvas` 修复。
- **COS 上传**：统一 API 错误处理、`/api/health/cos` 探针、`FILE_UPLOAD_STORAGE=local` 应急；Compose **`env_file`** 注入 COS 密钥（避免 `$` 被 compose 展开）。
- **部署**：CNB 推 `develop` / `main` 触发 `.cnb.yml`；VPS 勿与多个 backend 容器混用，见 CHANGELOG 与 `diagnose-cos-vps.sh`。

完整条目见 **[CHANGELOG.md](CHANGELOG.md)**。

## 公开仓库与安全

- **勿提交**真实 JWT、数据库口令、云密钥、Cookie；仅保留 `*.env.example`。
- **双远程**（CNB + GitHub）推送前确认无敏感信息；镜像仓库权限按团队策略管理。
