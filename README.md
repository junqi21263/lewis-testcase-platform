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

> 生产与 Railway 使用 **`prisma/schema.prod.prisma`** 与 `prisma/migrations/` 下迁移。本地请用 **同一套 schema** 生成 Client 与落库，避免与生产结构漂移。

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

## 环境变量说明

> 安全提示：**不要**把 `.env`、密钥、Token、私钥、生产域名/IP、数据库密码提交到仓库或粘贴到工单/群聊截图中。
> 本 README 中所有示例均为 **占位符**，请替换为你自己的值。

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

## 项目结构

```
lewis_testcase_platform/
├── frontend/                # React 前端
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
│       ├── schema.prod.prisma # 生产/Railway/本项目主 Schema（PostgreSQL）
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
- 生产环境：请通过 Railway/运维流程初始化管理员账号与权限

## 前后端联调与自测清单（建议每次发布前跑一遍）

> **部署路径二选一（或并存）：**
>
> - **Railway**：仓库绑定 GitHub 后，推送 **`main`** 触发后端构建与发布；数据库迁移见 `backend/start.sh` / `backend/migrate-release.sh`（推荐在 **Pre-deploy** 执行 `migrate-release.sh`，避免启动阶段长时间不监听端口）。
> - **自托管 VPS**：推荐使用 `docker-compose.full.yml`（前端 Nginx + 后端 + Postgres + Redis），并可配合 GitHub Actions / `scripts/smoke.sh` 做部署后冒烟。

### 1) 启动（全量栈）

```bash
docker compose -f docker-compose.full.yml up -d --build
```

### 2) 健康检查

- 裸健康检查（给平台/负载均衡用）：

```bash
curl -fsS http://127.0.0.1/health && echo
```

- API 健康检查（平台业务）：

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
  - 「初始化数据库」改为与生产一致：使用 **`prisma/schema.prod.prisma`** 执行 `migrate deploy` / `generate`，避免本地与 Railway 结构不一致。
  - 增补 **本地前后端对齐表**：Nest `globalPrefix`、`/health` 与 `/api/health`、前端 `VITE_API_BASE_URL` 与 Vite `/api` 代理。
  - **项目结构**中修正 `prisma/` 目录说明（`schema.prod.prisma`、`migrations/`、`seed.ts`）。
  - 「联调与自测」开头并列 **Railway（推送 `main`）** 与 **VPS + `docker-compose.full.yml`** 两类部署路径。
- **门禁脚本**：新增 `scripts/dev-integration-check.sh` — 在本机执行 `prisma validate` / `generate`（`schema.prod.prisma`）与前后端 **`pnpm build`**（不启动服务，便于 CI/发布前自检）。
- **推送与部署（摘要）**
  1. 可选：`bash scripts/dev-integration-check.sh`
  2. `git add` / `git commit` / **`git push origin main`**
  3. **Railway**：在 Dashboard 查看 Deployment；确认 Variables 含 **`DATABASE_URL`**、**`JWT_SECRET`**；数据库迁移建议在 **Pre-deploy** 跑 `backend/migrate-release.sh`（或按服务内 `start.sh` 说明），避免启动阶段长时间未监听端口。
  4. **自托管**：`docker compose -f docker-compose.full.yml up -d --build` 后执行 `bash scripts/smoke.sh`，或手动访问 `GET /api/health`。
