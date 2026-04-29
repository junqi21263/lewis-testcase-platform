# AI 测试用例生成平台

基于 AI 的智能测试用例生成平台，支持多种文档格式解析、多模型 AI 调用、团队协作管理。

## 技术栈

### 前端
- React 18 + TypeScript + Vite
- Shadcn UI + Tailwind CSS
- Zustand 状态管理
- React Router v6
- TanStack Table + Tiptap 富文本编辑器

### 后端
- Node.js + NestJS + TypeScript
- Prisma ORM + PostgreSQL
- JWT 鉴权
- 文件解析：pdf-parse、xlsx、mammoth、tesseract.js

## 快速启动

### 前置要求
- Node.js >= 18
- pnpm >= 8
- Docker & Docker Compose（用于数据库）

### 1. 克隆项目并安装依赖

```bash
# 安装前端依赖
cd frontend
pnpm install

# 安装后端依赖
cd ../backend
pnpm install
```

### 2. 配置环境变量

```bash
# 后端环境变量
cp backend/.env.example backend/.env
# 编辑 backend/.env，填写 AI API Key 等配置

# 前端环境变量
cp frontend/.env.example frontend/.env
```

### 3. 启动数据库

```bash
docker-compose up -d
```

### 4. 初始化数据库

> 生产与云服务器 / 容器部署使用 **`prisma/schema.prod.prisma`** 与 `prisma/migrations/` 下迁移。本地请用 **同一套 schema** 生成 Client 与落库，避免与生产结构漂移。

先确保 `docker-compose up -d` 已启动 Postgres，且 `backend/.env` 中 `DATABASE_URL` 与 compose 中库名/用户一致（见 `backend/.env.example`）。

```bash
cd backend
pnpm exec prisma migrate deploy --schema=./prisma/schema.prod.prisma
pnpm exec prisma generate --schema=./prisma/schema.prod.prisma
pnpm prisma db seed
```

若需新建迁移（改 schema 后）：`pnpm exec prisma migrate dev --schema=./prisma/schema.prod.prisma`

### 5. 启动服务

```bash
# 终端1：启动后端（端口 3000）
cd backend
pnpm start:dev

# 终端2：启动前端（端口 5173）
cd frontend
pnpm dev
```

访问 http://localhost:5173

## 文档导航

- 开发与测试：`docs/development/DEVELOPMENT.md`、`docs/development/TEST_PLAN.md`、`docs/development/AUTHENTICATION_FEATURES.md`
- EdgeOne 部署与安全：`docs/deployment/edgeone/guides/`
- EdgeOne 脚本：`docs/deployment/edgeone/scripts/`
- EdgeOne 配置样例：`docs/deployment/edgeone/configs/`
- 文档分层说明：`docs/README.md`

### 本地前后端联调要点（对齐）

| 层级 | 约定 |
|------|------|
| 后端 | Nest 全局前缀 `api`，监听默认 `APP_PORT`（一般为 `3000`），业务接口形如 **`http://localhost:3000/api/...`** |
| 裸健康检查 | **`GET http://localhost:3000/health`** → 纯文本 `ok`（不经 `globalPrefix`） |
| 业务健康检查 | **`GET http://localhost:3000/api/health`** → JSON：`status`、`workerEnabled`、解析队列计数等 |
| 前端 axios | `getApiBaseUrl()`：`VITE_API_BASE_URL` 为空时开发环境默认为 **`/api`**，由 Vite 代理到后端（见 `frontend/vite.config.ts`） |
| 前端 `.env` | 推荐 **`VITE_API_BASE_URL=/api`**（同源代理）；也可设为 **`http://localhost:3000/api`**（直连后端，不使用 Vite 代理），二者择一即可 |

一键门禁（**不拉起进程**，仅校验构建与 Prisma）：

```bash
bash scripts/dev-integration-check.sh
```

## 系统优化迭代计划（存档）

本节用于**记录系统优化与可维护性迭代计划**，便于团队协作与知识传承；按「小步快跑、向后兼容、可验证验收」原则执行。若实际需求变化，可在后续版本中滚动更新本节内容。

### 问题清单（按模块）

- **环境与配置（高影响）**
  - dev/production 数据源容易混淆（本地 `SQLite dev.db` vs 线上 `PostgreSQL`）；“SSH 登录服务器”≠“应用已连上数据库”。
  - 生产环境变量加载方式需统一说明（`.env` / PM2 / systemd / Docker），避免缺配导致 `DATABASE_URL`/密钥不可用。
  - 单机（轻量）资源与容量边界需说明（CPU/内存/磁盘、连接数、备份策略）。
- **AI 输出与导出一致性（业务可见）**
  - 模型偶发输出 Markdown/长文，依赖解析兜底；需降低“整段糊成一条”的概率。
  - 用例字段需与 Excel 六列导出一致（用例名称、所属模块、标签、前置条件、步骤描述、预期结果）。
  - 种子模板文案更新路径需标准化（`prisma db seed` 生效范围、已存在模板的 update 策略）。
- **工程可维护性（中长期）**
  - 前后端存在双份 loose-parse 逻辑，需通过共享测试夹具/单测减少漂移。
  - 缺少“上线前检查清单”（JWT/AI Key/DB/迁移/seed/备份），易出现环境问题回归。

### 优先级（重要性 × 紧急性）

- **P0**：生产 `DATABASE_URL`/环境变量单一说明；迁移 + seed 标准命令；避免 dev 库误用于生产。
- **P1**：部署 Runbook（拉代码 → build → migrate → seed → restart）；轻量单机备份与磁盘管理策略。
- **P2**：解析契约测试（同一批样例输出的解析断言）；AI 输出失败/截断的可观测性（分类与提示）。
- **P3**：中长期演进（RDS/读写分离、可观测大盘、容量规划与成本优化）。

### 版本迭代规划（建议 2 周一个迭代）

- **迭代 1（第 1–2 周）— 环境可信 + 可重复发布**
  - **目标**：任何人按文档能在轻量完成一次可重复升级（不踩 DB/seed/变量坑）。
  - **交付**：
    - 《部署与环境》说明：dev=SQLite vs prod=Postgres；Navicat SSH 隧道与服务器本机 `127.0.0.1` 的区别；`DATABASE_URL` 示例。
    - 标准命令块：`migrate deploy` → `generate` → `db seed` → 重启。
    - 上线前检查清单：`JWT_SECRET`、`OPENAI_API_KEY`、DB 连通、迁移状态、seed 是否执行、备份是否开启。
  - **验收**：新成员按文档在目标环境完成一次升级并可登录使用。
- **迭代 2（第 3–4 周）— 质量与一致性**
  - **目标**：降低解析漂移与回归成本。
  - **交付**：
    - 解析测试夹具与断言（后端为主，必要时前端复用或镜像）。
    - 轻量单机备份脚本（cron + `pg_dump`）与恢复演练记录。
  - **验收**：CI 能验证解析关键样例；备份可用且有恢复步骤。
- **迭代 3（第 5–6 周）— 可观测与产品化（按需）**
  - **目标**：对 AI 生成失败/截断/解析失败有可定位的指标与日志。
  - **交付**：失败原因分类、生成成功率/失败率与耗时指标、管理端或日志报表入口（可选）。

## 环境变量说明

> 安全提示：**不要**把 `.env`、密钥、Token、私钥、生产域名/IP、数据库密码提交到仓库或粘贴到工单/群聊截图中。  
> 本 README 与 EdgeOne 相关文档中的域名、项目 ID、示例口令均为 **占位符**；验证脚本通过环境变量传入真实主机名（见 `docs/deployment/edgeone/scripts/verify-edgeone-config.sh`）。

### 后端 `backend/.env`

| 变量名 | 说明 | 示例 |
|--------|------|------|
| `DATABASE_URL` | PostgreSQL 连接串 | `postgresql://<DB_USER>:<DB_PASS>@<DB_HOST>:5432/<DB_NAME>` |
| `JWT_SECRET` | JWT 签名密钥 | `<RANDOM_32+_CHARS>` |
| `JWT_EXPIRES_IN` | JWT 过期时间 | `7d` |
| `OPENAI_API_KEY` | 模型 API Key（兼容 OpenAI 风格） | `<YOUR_API_KEY>` |
| `OPENAI_BASE_URL` | 模型接口 Base URL（兼容其他供应商） | `https://<PROVIDER_HOST>/v1` |
| `DEFAULT_AI_MODEL` | 默认模型 ID | `<MODEL_ID>` |
| `UPLOAD_DIR` | 文件上传目录 | `./uploads` |
| `MAX_FILE_SIZE` | 最大文件大小（字节） | `10485760` |
| `CORS_ORIGINS` | 允许的前端 Origin（逗号分隔） | `http://localhost:5173,https://<YOUR_DOMAIN>` |
| `FRONTEND_URL` | 前端地址（部分场景用于回跳/链接） | `https://<YOUR_DOMAIN>` |
| `AUTH_ALLOW_PLAINTEXT_PASSWORD` | 允许明文密码救援（登录成功后自动升级为 bcrypt） | **默认留空**；仅应急、短期开启，用完立刻关闭 |

### 前端 `frontend/.env`

| 变量名 | 说明 | 示例 |
|--------|------|------|
| `VITE_API_BASE_URL` | 后端 API 基址（须以 `/api` 结尾，与 Nest `globalPrefix` 一致） | `http://localhost:3000/api`（生产推荐 `/api`） |
| `VITE_APP_NAME` | 应用名称 | `AI 测试用例平台` |

### 生产部署：云服务器（推荐，不依赖 Railway）

默认推荐在 **自有云服务器（VPS）** 上用 **Docker Compose** 跑全栈：**前端 Nginx（80）+ 后端 + PostgreSQL + Redis**，**单公网入口**，前端将 **`/api`** 反代到后端，**无需**把数据库或 Redis 暴露到公网。

#### 架构与端口

| 组件 | 说明 |
|------|------|
| **入口** | 宿主机 **80** → `frontend` 容器（静态资源 + 反代） |
| **裸探活** | `GET http://<服务器>/health` → 经 Nginx 转发后端 **`GET /health`**（纯文本 `ok`） |
| **业务探活** | `GET http://<服务器>/api/health` → JSON（队列状态等） |
| **PostgreSQL** | 默认仅 **`127.0.0.1:5432`** 映射到宿主机，便于 SSH 隧道 / 本机客户端，**勿对 0.0.0.0 开放** |
| **后端** | 不映射宿主机端口，仅容器网络内 `backend:3000` |

**流式生成（SSE）**：经前端 Nginx 反代时，`frontend/nginx.conf.template` 对 **`/api/ai/generate/stream`** 已配置 **`proxy_buffering off`**、**`proxy_request_buffering off`**、关闭 gzip、延长读超时；后端会设置 **`X-Accel-Buffering: no`** 并定时发送 **SSE 注释心跳**（`: ping`），减轻中间层因空闲断开连接。若前面还有**云负载均衡 / CDN**，请把**空闲超时**调到 ≥ **60s**（或关闭对长连接的过早回收），否则仍可能出现 **`ERR_INCOMPLETE_CHUNKED_ENCODING`**。

#### 首次在服务器上部署

1. **安装** Docker Engine 与 **Docker Compose 插件**（或 `docker-compose` 独立二进制）；防火墙 / 安全组放行 **80**（若上 HTTPS 再开 **443**）。
2. 将本仓库放到部署目录（例如 `/opt/<your-deploy-path>`），可用 `git clone` 或下文 **GitHub Actions rsync**。
3. 在**与 `docker-compose.full.yml` 同级**目录创建环境文件：  
   `cp docker-compose.full.env.example .env`  
   编辑 **`.env`**：`DB_PASSWORD`、`DATABASE_URL`（与 DB 账号一致）、**`JWT_SECRET`**、**`FRONTEND_URL`** / **`CORS_ORIGINS`**（填你的公网访问域名）、`OPENAI_*` 等。
4. 启动并构建：  
   `docker compose -f docker-compose.full.yml up -d --build`
5. 冒烟（仓库根目录）：  
   `bash scripts/smoke.sh`  
   或手动：`curl -fsS http://127.0.0.1/api/health`

数据库迁移由 **`backend/Dockerfile`** 构建阶段与 **`backend/start.sh`** 在容器启动时执行（与 Railway 无关）；确保 **`DATABASE_URL`** 指向 compose 内 **`postgres`** 服务。

#### 用 Git 更新（CI 推送云服务器，可选）

请在 CI 平台配置 **部署凭据占位符**（例如：`<DEPLOY_SSH_HOST>`、`<DEPLOY_SSH_USER>`、`<DEPLOY_SSH_KEY>`、`<DEPLOY_SSH_PORT>`）与部署路径变量 `<DEPLOY_PATH>`；避免在 README 中固化真实机器、账号或目录。  
推送 **`main`** 时 **`.github/workflows/deploy-vps.yml`** 会：在 Runner 上 **`pnpm install && pnpm build`** 打包 **前端 `dist/`**，再 **rsync** 到服务器并执行 **`docker compose -f docker-compose.full.yml up -d --build`**（前端镜像会优先复用已同步的 **`dist/`**，见 `frontend/Dockerfile`），最后 **`scripts/smoke.sh`**。可选：在 CI Variables 中设置 **`VITE_API_BASE_URL`**、**`VITE_APP_NAME`**（默认 **`/api`**，与同源 Nginx 反代一致）。

#### 可选：Railway / 其他 PaaS

若个别环境仍用 Railway：根目录 `railway.toml` 与 **`frontend/railway.toml`** 仅为 **可选** 配置；**云服务器部署不依赖** 这些文件。Railway 上前后端分服务时，需配置 **`VITE_API_BASE_URL`** 与后端 **`CORS_ORIGINS`**（详见 `frontend/railway.toml` 内注释）。

#### 静态托管（EdgeOne 等）

也可将 **`frontend/dist`** 或 **`frontend/dist.zip`** 上传到 CDN/静态托管，API 指向独立后端域名；与 Compose **二选一** 为主即可。
详细步骤与安全校验见 `docs/deployment/edgeone/guides/`。

## 项目结构

```
testcase-platform/
├── docker-compose.full.yml   # 云服务器全栈（前端 Nginx + 后端 + Postgres + Redis）
├── docker-compose.full.env.example  # 全栈 .env 模板（复制为 .env）
├── frontend/                # React 前端（可选：Railway / 仅作镜像构建）
│   ├── railway.toml         # 可选：仅在使用 Railway 时需要
│   ├── Dockerfile
│   ├── src/
│   │   ├── api/             # API 请求层
│   │   ├── assets/          # 静态资源
│   │   ├── components/      # 公共组件
│   │   │   ├── layout/      # 布局组件
│   │   │   └── ui/          # 基础 UI 组件
│   │   ├── hooks/           # 自定义 Hooks
│   │   ├── pages/           # 页面组件
│   │   ├── store/           # Zustand 状态
│   │   ├── types/           # TypeScript 类型
│   │   └── utils/           # 工具函数
│   └── ...
├── backend/                 # NestJS 后端
│   ├── src/
│   │   ├── common/          # 公共模块
│   │   │   ├── filters/     # 全局异常过滤器
│   │   │   ├── guards/      # 路由守卫
│   │   │   ├── interceptors/# 响应拦截器
│   │   │   └── decorators/  # 自定义装饰器
│   │   ├── modules/         # 业务模块
│   │   │   ├── auth/        # 鉴权模块
│   │   │   ├── admin/       # 超管运维模块（重置密码/改角色）
│   │   │   ├── teams/       # 团队模块
│   │   │   ├── files/       # 文件模块
│   │   │   ├── document-parse/# 文档解析模块
│   │   │   ├── ai/          # AI 调用模块
│   │   │   ├── testcases/   # 用例管理模块
│   │   │   ├── templates/   # 模板管理模块
│   │   │   └── records/     # 生成记录模块（分享/对比/回收站等）
│   │   └── prisma/          # Prisma 服务
│   └── prisma/
│       ├── schema.prod.prisma # 生产/云服务器主 Schema（PostgreSQL）
│       ├── migrations/       # `migrate deploy` 使用的 SQL 迁移
│       ├── schema.prisma      # 历史/本地 SQLite 演示（勿与 prod 混用）
│       └── seed.ts
├── scripts/
│   ├── smoke.sh              # 全栈 compose 启动后的 `/api/health` 冒烟
│   └── dev-integration-check.sh  # 本地构建 + Prisma 校验（联调门禁）
└── docker-compose.yml
```

## 默认账号

出于安全考虑，本项目 **不在文档中提供默认账号/密码**。

- 本地开发：请在首次启动后自行注册账号，或在数据库中手动创建/提升角色
- 生产环境：请通过云服务器上的种子脚本 / 运维流程初始化管理员账号与权限（见 `backend/.env.example` 中 `ADMIN_*`）

## 前后端联调与自测清单（建议每次发布前跑一遍）

> **生产推荐路径**：**云服务器 + `docker-compose.full.yml`**（见上文「生产部署：云服务器」）；可用 GitHub Actions 推送 **`main`** 自动 rsync 与 compose 重建。  
> **可选**：Railway 等 PaaS 见同节「可选：Railway」。

### 1) 启动（全量栈）

在已配置 **`.env`**（由 `docker-compose.full.env.example` 复制）的目录执行：

```bash
docker compose -f docker-compose.full.yml up -d --build
```

### 2) 健康检查

经 **前端 Nginx（默认宿主机 80）**：

- 裸健康检查（负载均衡 / 平台探活，纯文本 `ok`）：

```bash
curl -fsS http://127.0.0.1/health && echo
```

- API 健康检查（业务 JSON）：

```bash
curl -fsS http://127.0.0.1/api/health && echo
```

也可在仓库根目录执行：

```bash
bash scripts/smoke.sh
```

### 3) 登录/生成/导出/分享（UI 自测）

- **登录**：支持“用户名或邮箱 + 密码”登录
- **生成测试用例**：
  - 文件上传 → 等待解析完成 → 生成（建议勾选“流式输出”）
  - 生成完成页：
    - **查看记录**（跳转记录详情）
    - **生成分享链接**（复制公开链接）
    - **导出 Excel / Markdown / JSON / CSV**（Excel 优先后端 `suite` 流式导出；无 suiteId 或失败时降级为浏览器端 JSON/Markdown/CSV；CSV 列顺序与后端 Excel 约定一致）
    - Excel 下载文件名形如 **`YYYYMMDD_HHmm.xlsx`**（由服务端生成时间决定）
    - **复制 JSON**
- **模板效率**：
  - 生成页显示“最近模板”快捷按钮
  - 模板管理页点击“去生成”后，生成页应自动带入模板并记录最近使用
- **复用记录**：
  - 在记录列表/详情点击“复用到生成”，若记录来自文件，应自动带入原文件（无需重新上传）

### 4) 超级管理员运维（仅 SUPER_ADMIN）

系统设置页新增 **“超级管理员工具”**：

- 搜索用户（邮箱/用户名）
- 选择用户后：
  - **重置密码**
  - **修改角色**（SUPER_ADMIN > ADMIN > MEMBER > VIEWER）
- **运维审计日志**（仅 SUPER_ADMIN）：查看近期的密码重置 / 角色变更记录（不落库明文密码）

## 版本迭代记录

> 更细粒度的历史可参考 `CHANGELOG.md` 与 Git 提交日志。本节在 README 中保留“里程碑”级别的迭代摘要，便于快速了解版本演进。

### 后续版本如何补充本文档（约定）

每次合并进主分支或发布前，建议在 **本节末尾追加一条「日期 + 标题」小节**，写明：

- **用户可见**：界面/流程变化（页面、按钮、默认行为）
- **运维相关**：迁移、环境变量、部署/健康检查是否需要额外步骤
- **安全**：是否涉及权限、Secrets、公开接口（仍勿写入真实密钥、域名、账号）

示例（复制后改内容即可）：

```markdown
### YYYY-MM-DD（短标题，如：某功能上线）

- 变更点 1
- 变更点 2
```

与代码提交 **同一 MR/提交** 中更新 README，避免事后补记遗漏。

### 2026-04-13（鉴权与 API 报文对齐）

- **API 响应约定统一**
  - 业务接口语义错误通过 JSON 的 `code` 表达（成功 `code: 0`），并在前端 axios 层统一拦截提示
  - 裸路由 `GET /health` 保持纯文本 `ok`（200），用于平台健康检查
- **注册/登录与安全性**
  - 登录/注册失败提示与后端校验一致，减少“前端放行但后端 400”的摩擦
  - 忘记密码返回统一说明，降低邮箱枚举风险

### 2026-04-10 ~ 2026-04-23（能力建设：认证、邮件、解析、记录体系）

- **认证与权限体系成型**
  - 引入 `UserRole`（SUPER_ADMIN / ADMIN / MEMBER / VIEWER）与全局 RolesGuard
  - 团队/成员能力逐步完善（团队成员角色、团队范围数据可见性）
- **邮件能力与注册/找回闭环**
  - 邮箱验证码注册与重置密码（OTP/挑战表），并对失败场景做“安全提示 + 不暴露用户是否存在”
  - 邮件发送适配多种服务商（以环境变量注入为主），并提供连通性自检脚本
- **文件上传与解析能力增强**
  - 支持更大文件与更稳健的上传链路（分片上传/合并、失败诊断）
  - 文档解析与结构化快照（便于后续“从解析结果带入生成”）
  - OCR/多语言与解析失败兜底策略逐步完善（超时/卡住任务可恢复）
- **生成与记录体系**
  - 生成记录列表/详情、过滤、批量操作、回收站（软删除）等基础能力打通
  - 结果页/导出能力迭代：从“仅展示”到“可导出、可复用、可回溯”
- **模板体系**
  - 模板可复制编辑、与生成关联 templateId、usageCount 统计，支持内置专业模板

### 2026-04-24 ~ 2026-04-26（部署稳定性与生产化打磨）

- **Railway/容器启动稳定性**
  - 启动阶段迁移与健康检查路径调整，降低 502/超时误判
  - 关键依赖在 Docker/Alpine 下的构建稳定性修复（如 canvas/pdf 渲染相关依赖）
- **解析 Worker 稳定性**
  - 解析任务从“易受实例影响”逐步收敛到“DB 驱动 + 可恢复”的 worker 模式
  - 卡住的 PARSING 状态可通过超时标记失败并引导重试
- **CORS 与前后端联调优化**
  - Origin 归一化、错误提示更可诊断
  - 生产环境建议前端走同源 `/api` 反向代理，避免跨域复杂度

### 2026-04-24 ~ 2026-04-27（自托管/部署与体验增强）

- **VPS 自动部署闭环（GitHub Actions → SSH → rsync → compose）**
  - `.github/workflows/deploy-vps.yml`：Runner `checkout` 后 `rsync` 到服务器，避免服务器端 `git clone` 受网络影响
  - 部署后运行 `scripts/smoke.sh` 做最小可用性验证
- **生产 Compose 硬化**
  - `docker-compose.full.yml`：前端 Nginx + 后端 + Postgres + Redis 全量栈
  - 默认不对公网暴露 Postgres/Redis；可选仅绑定 `127.0.0.1:5432` 便于 Navicat/SSH 隧道连接“与后端同库”
  - 生产配置参数化（JWT/CORS/模型 BaseURL 等）
- **登录失败/密码问题“底层修复”**
  - 登录支持“用户名或邮箱”
  - 增加 `AUTH_ALLOW_PLAINTEXT_PASSWORD` 应急救援：允许明文比对并在成功后自动升级为 bcrypt（仅救援脏数据，建议关闭）
  - `users.username` 唯一约束迁移：自动处理历史重复用户名，避免登录匹配不确定
- **可观测性与运维体验**
  - Dashboard 增加运行状态（后端健康 + 解析队列状态）
  - 系统设置增加“模型连通性测试”（管理员）与“超级管理员工具”（用户查询/重置密码/改角色）
- **生成效率与交付体验**
  - 最近模板快捷入口、模板“去生成”带入、复用记录自动带入原文件
  - 生成完成页新增：查看记录 / 分享链接 / 导出（Excel/Markdown/JSON）/ 复制 JSON（无 suiteId 自动降级前端导出）

### 2026-04-27（本轮迭代明细）

本次迭代聚焦“部署稳定性 + 生成效率 + 结果交付体验 + 运维能力”。

- **部署与可观测性**
  - 新增/完善 VPS 自动部署工作流：Runner 拉取代码后 rsync 到服务器，再 `docker compose up -d --build`
  - 部署后自动执行 `scripts/smoke.sh` 验证 `/api/health`
  - `docker-compose.full.yml` 默认不对公网暴露 Postgres/Redis；Postgres 可选仅绑定 `127.0.0.1:5432` 便于 SSH 隧道工具连接

- **登录/鉴权与数据一致性**
  - 登录支持“用户名或邮箱”
  - 增加明文密码应急开关 `AUTH_ALLOW_PLAINTEXT_PASSWORD`：登录成功后自动升级为 bcrypt（仅用于救援历史脏数据）
  - 生产 Prisma schema 强化 `users.username` 唯一约束并提供迁移（避免重复用户名导致登录不确定）

- **生成效率**
  - 生成页新增“最近模板”快捷入口（本地持久化）
  - 记录复用到生成时，若原记录关联文件，自动带入文件以免重复上传

- **生成结果交付体验**
  - 生成完成页提供：查看记录 / 分享链接 / 导出（Excel/Markdown/JSON）/ 复制 JSON
  - 导出优先走后端 suite 导出，失败或缺少 suiteId 时自动降级为前端导出

- **管理员运维**
  - 新增 `SUPER_ADMIN` 用户运维能力：查询用户、重置密码、修改角色（前端设置页提供操作面板）

> 注：上面的“本轮迭代明细”是对关键提交的归纳，便于快速验收与回归测试。

### 2026-04-28（超级管理员运维审计）

- **审计表与 API**
  - 新增数据库表 `admin_audit_logs`（随生产迁移发布；不存储明文密码）
  - 超管 **重置密码**、**修改角色** 时写入审计；提供 `GET /api/admin/audit-logs` 供超管拉取近期记录
- **前端**
  - 系统设置 → 在「超级管理员工具」下增加 **「运维审计日志」** 只读列表，并支持手动刷新
- **自测建议**
  - 以 `SUPER_ADMIN` 登录后，在设置页完成一次改角色或重置密码，应能在审计区看到对应操作类型（**不**应出现密码内容）

### 2026-04-29（测试用例 Excel / 降级导出对齐）

- **后端 Excel（权威）**
  - `GET /api/testcases/suites/:id/export?format=EXCEL`：表头顺序固定为  
    **用例名称 → 所属模块 → 标签 → 前置条件 → 步骤描述 → 预期结果 → 编辑模式 → 备注 → 用例等级**
  - 「所属模块」优先取用例集的 `projectName`，否则用用例集名称
  - 「编辑模式」由用例 `status` 映射为草稿/评审中/已通过/已归档
  - 文件名：**`YYYYMMDD_HHmm.xlsx`**（示例：`20260428_0951.xlsx`）
- **前端（降级 CSV / 文件名）**
  - 浏览器端 CSV 列顺序与含义与上表一致；必要时请求用例集信息补全「所属模块」
  - 降级导出的 JSON/Markdown/CSV 文件名中的时间戳格式与后端 Excel 保持一致（`YYYYMMDD_HHmm`）
  - 无服务端 `suiteId` 时点击 **Excel** 会提示改从「生成记录」导出或确认已落地用例集（Excel 依赖后端生成文件流）
- **联调自检**
  - 有一条已关联 `suiteId` 的生成记录时：在记录详情或生成页导出 Excel，打开表格核对表头顺序与文件名格式
  - 去掉 `suiteId` 场景（仅前端内存用例）：导出 CSV，核对列与 Excel 约定一致

### 2026-04-28（文档）联调对齐、门禁脚本与部署路径

- **README**
  - 「初始化数据库」改为与生产一致：使用 **`prisma/schema.prod.prisma`** 执行 `migrate deploy` / `generate`，避免本地与生产结构不一致。
  - 增补 **本地前后端对齐表**：Nest `globalPrefix`、`/health` 与 `/api/health`、前端 `VITE_API_BASE_URL` 与 Vite `/api` 代理。
  - **项目结构**中修正 `prisma/` 目录说明（`schema.prod.prisma`、`migrations/`、`seed.ts`）。
  - 「联调与自测」以 **云服务器全栈** 为主（后续 README 已进一步明确，见下方「云服务器为默认生产部署」）。
- **门禁脚本**：新增 `scripts/dev-integration-check.sh` — 在本机执行 `prisma validate` / `generate`（`schema.prod.prisma`）与前后端 **`pnpm build`**（不启动服务，便于 CI/发布前自检）。
- **推送与部署（摘要）**
  1. 可选：`bash scripts/dev-integration-check.sh`
  2. `git add` / `git commit` / **`git push origin main`**
  3. **云服务器**：配置 **`.env`**（`docker-compose.full.env.example`）后 `docker compose -f docker-compose.full.yml up -d --build`，再 **`bash scripts/smoke.sh`**；若启用 GitHub Actions，推送 `main` 会自动 rsync 并 compose。
  4. **Railway（可选）**：在 Dashboard 查看 Deployment；Variables 含 **`DATABASE_URL`**、**`JWT_SECRET`** 等；迁移见 `backend/migrate-release.sh` / `start.sh`。

### 2026-04-28（云服务器为默认生产部署）

- **README**：生产默认路径改为 **自有云服务器 + `docker-compose.full.yml`**，**不依赖 Railway**；Railway / EdgeOne 仅作可选说明。
- **`docker-compose.full.env.example`**：全栈 **`.env`** 模板（数据库、JWT、CORS、`VITE_*` 等）。
- **Nginx**：`nginx.conf.template` 增加 **`/health`** 反代至后端裸探活，与全栈 **80** 入口一致。

### 2026-04-28（Railway 前端 · Git 部署）

- **`frontend/railway.toml`**：在同一 Railway 项目中新建服务，**Root Directory = `frontend`**，推送 `main` 即构建 **前端镜像**（与根目录后端服务共用仓库）。
- **`frontend/Dockerfile`**：改为 **pnpm** 安装；支持构建参数 **`VITE_API_BASE_URL`** / **`VITE_APP_NAME`**（跨域部署后端时必填前者）；**`nginx.conf.template` + `docker-entrypoint.sh`** 支持平台注入的 **`PORT`**（Railway 必需）。
- **`docker-compose.full.yml`**：为 `frontend` 构建传入可选 **`VITE_*`**，与 VPS 全栈 Git 部署一致。

### 2026-04-29（当日部署、更新与修改）

- **联调与契约对齐**
  - 后端增强联调冒烟脚本：`backend/scripts/smoke-enhancements.ts` 统一按 `{ code, data }` 解包，覆盖 `/health`、登录、偏好、壁纸、天气关键路径。
  - 前端新增联调入口：`frontend/package.json` 增加 `integrate:smoke`，可从前端目录触发后端冒烟。
- **UI/UX 修复与一致性**
  - 侧边栏命中区、折叠按钮、选中态统一优化；修复“动态壁纸关闭后主界面露白”并清理多余描边，提升暗色与玻璃风格一致性。
- **测试体系升级**
  - Playwright CT 修复并扩展：新增 Sidebar 组件测试，壁纸/天气用例稳定化，组件测试通过。
  - 引入 Vitest 单元测试：覆盖 `cn`、`normalizeApiBase`、`authStore`、`themeStore`。
  - Allure 报告整合：`pnpm allure:report` 一次执行单元 + 组件测试并生成 `frontend/allure-report`。
- **Playwright Agents / MCP**
  - 已初始化 `planner / generator / healer` 代理定义。
  - 针对当前 CLI 版本，文档改为推荐 Cursor 使用 `npx @playwright/mcp@latest`，避免 `run-test-mcp-server` 报错。
- **部署状态**
  - 当日改动均已合并并推送到 `main`；前端构建产物 `frontend/dist.zip` 已更新（未入库）。

### 2026-04-29（文档脱敏与泄漏防护）

- 将 CI/部署示例中的主机、账号、密钥、路径统一替换为占位符（如 `<DEPLOY_SSH_HOST>`、`<DEPLOY_PATH>`）。
- 删除/避免在 README 中出现可被直接复用的真实基础设施标识（主机名、用户名、私钥路径等）。
- 保留操作流程与校验步骤，降低文档泄漏时的可利用风险。
