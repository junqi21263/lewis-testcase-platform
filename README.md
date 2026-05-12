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
| **文档解析** | `/upload`，`POST /api/files/*` | 单文件与分片上传；可选 **腾讯云 COS** 直传；PDF / Word / Excel / 图片等多格式解析；解析进度与重试；大图 **视觉理解** 与可配置 OCR 策略 |
| **AI 需求分析** | `/ai-analysis`，`POST /api/ai/analyze/stream` | **SSE 流式**输出；默认 **六段结构化**报告（功能 / 非功能 / 接口 / 数据模型 / 业务流程含 Mermaid / 风险）；报告区 **Mermaid 渲染**；**导出 XMind**；**导出 PDF**（`POST /api/ai/analyze/export-pdf`，可将 Mermaid 渲染图为 Base64 嵌入） |
| **生成用例** | `/generate`，`POST /api/ai/generate`、`/api/ai/generate/stream` | 非流式与 **SSE 流式**生成测试用例；模型列表 `GET /api/ai/models` |
| **生成记录** | `/records`，` /api/records` | 记录查询、分享、批量操作；定时清理等（见模块实现） |
| **模板管理** | `/templates`，`/api/templates` | 用例/提示模板维护 |
| **团队管理** | `/teams`，`/api/teams` | 团队与成员权限 |
| **系统设置** | `/settings`，`/api/settings` 等 | **AI 模型配置**；用户偏好；**天气城市**与**壁纸**（顶栏天气、全屏壁纸层，见 `WeatherBadge`、`WallpaperLayer`） |
| **认证** | `/api/auth` | 注册（邮箱+用户名+密码）、**登录（用户名+密码）**、忘记/重置密码；业务错误多为 **HTTP 200 + JSON `code`**（见 [CHANGELOG](CHANGELOG.md) 2026-04-13） |
| **管理员** | `/api/admin` | 运维与管理员能力（含模型连通性测试 `POST /api/ai/test` 等） |
| **文档解析记录** | `/api/document-parse` | 解析任务与记录接口 |

**健康检查**：`GET /health` 返回纯文本 `ok`；`GET /api/health` 返回 JSON。API 全局前缀为 **`/api`**（Swagger：`http://localhost:3000/api/docs`）。

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

图片解析性能、视觉模型 `detail`、OCR 超时、是否在视觉已识别正文时跳过第二轮结构化 LLM 等，见 **`backend/.env.example`**（如 `VISION_IMAGE_*`、`IMAGE_PARSE_SKIP_OCR_WHEN_VISION_OK`、`STRUCTURE_LLM_FOR_VISION_DOC`、`IMAGE_OCR_TIMEOUT_MS`）。

## 文档索引

| 文档 | 内容 |
|------|------|
| [docs/README.md](docs/README.md) | `docs/` 目录说明 |
| [docs/development/DEVELOPMENT.md](docs/development/DEVELOPMENT.md) | 研发说明 |
| [docs/development/GIT_WORKFLOW.md](docs/development/GIT_WORKFLOW.md) | 分支与发布流程 |
| [docs/development/ENVIRONMENT_VARIABLES.md](docs/development/ENVIRONMENT_VARIABLES.md) | 环境变量 |
| [docs/deployment/VPS_DOCKER.md](docs/deployment/VPS_DOCKER.md) | 自托管 Docker 与 CI |
| [docs/deployment/VPS_GHCR_DUAL_ENV.md](docs/deployment/VPS_GHCR_DUAL_ENV.md) | VPS 双目录（dev/prod）环境变量同步与 compose 命令步骤 |
| [docs/deployment/COMPOSE_FILES.md](docs/deployment/COMPOSE_FILES.md) | 根目录各 `docker-compose*.yml` |
| [CHANGELOG.md](CHANGELOG.md) | 变更日志 |

## 仓库结构（摘要）

```
├── frontend/          # Web 前端（Vitest / Playwright 见 frontend/README.md）
├── backend/           # Nest API（Prisma `schema.prod.prisma` 为准）
├── docker-compose*.yml
├── docker-compose.full.env.example
├── scripts/           # 本地检查、CI 部署脚本
└── docs/
```

## 默认账号

仓库不提供默认口令。本地请注册或通过 seed / `ADMIN_*` 等运维流程创建管理员（见 `backend/.env.example`）。

## 最近更新（2026-05 起）

- **AI 需求分析**：XMind / PDF 导出、报告内 **Mermaid**、六段模板、流式终端与报告区布局优化。
- **文件 / 图片解析**：跳过冗余 OCR 与可选第二轮结构化 LLM、可配置超时与 heartbeat（详见 CHANGELOG）。
- **部署**：以 **CNB + `.cnb.yml`** 为主；GitHub Actions `deploy-vps` 多为手动触发。
- **工程**：Express 作为后端生产直接依赖、依赖与 Compose 示例安全加固等。

完整条目见 **[CHANGELOG.md](CHANGELOG.md)**。

## 公开仓库与安全

- **勿提交**真实 JWT、数据库口令、云密钥、Cookie；仅保留 `*.env.example`。
- **双远程**（CNB + GitHub）推送前确认无敏感信息；镜像仓库权限按团队策略管理。
