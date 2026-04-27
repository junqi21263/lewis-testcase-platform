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

```bash
cd backend
pnpm prisma migrate dev --name init
pnpm prisma db seed
```

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

## 环境变量说明

### 后端 `backend/.env`

| 变量名 | 说明 | 示例 |
|--------|------|------|
| `DATABASE_URL` | PostgreSQL 连接串 | `postgresql://user:pass@localhost:5432/db` |
| `JWT_SECRET` | JWT 签名密钥 | 随机 32 位字符串 |
| `JWT_EXPIRES_IN` | JWT 过期时间 | `7d` |
| `OPENAI_API_KEY` | 模型 API Key（兼容 OpenAI 风格） | `sk-...` |
| `OPENAI_BASE_URL` | 模型接口 Base URL（兼容其他供应商） | `https://api.openai.com/v1` |
| `DEFAULT_AI_MODEL` | 默认模型 ID | `gpt-4o` |
| `UPLOAD_DIR` | 文件上传目录 | `./uploads` |
| `MAX_FILE_SIZE` | 最大文件大小（字节） | `10485760` |
| `CORS_ORIGINS` | 允许的前端 Origin（逗号分隔） | `http://localhost:5173,http://your-domain.com` |
| `FRONTEND_URL` | 前端地址（部分场景用于回跳/链接） | `http://localhost:5173` |
| `AUTH_ALLOW_PLAINTEXT_PASSWORD` | 允许明文密码救援（登录成功后自动升级为 bcrypt） | `1`（仅应急，建议关闭） |

### 前端 `frontend/.env`

| 变量名 | 说明 | 示例 |
|--------|------|------|
| `VITE_API_BASE_URL` | 后端 API 基址（须以 `/api` 结尾，与 Nest `globalPrefix` 一致） | `http://localhost:3000/api`（或生产用 `/api`） |
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
│       └── schema.prisma    # 数据库 Schema
└── docker-compose.yml
```

## 默认账号

出于安全考虑，本项目 **不在文档中提供默认账号/密码**。

- 本地开发：请在首次启动后自行注册账号，或在数据库中手动创建/提升角色
- 生产环境：请通过 Railway/运维流程初始化管理员账号与权限

## 前后端联调与自测清单（建议每次发布前跑一遍）

> 本项目生产部署推荐使用 `docker-compose.full.yml`（前端 Nginx + 后端 + Postgres + Redis），并通过 GitHub Actions 自动部署到 VPS。

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
    - **导出 Excel / Markdown / JSON**（优先后端 suite 导出；无 suiteId 自动降级前端导出）
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

## 版本迭代记录

> 更细粒度的历史可参考 `CHANGELOG.md` 与 Git 提交日志。本节在 README 中保留“里程碑”级别的迭代摘要，便于快速了解版本演进。

### 2026-04-13（鉴权与 API 报文对齐）

- **API 响应约定统一**
  - 业务接口语义错误通过 JSON 的 `code` 表达（成功 `code: 0`），并在前端 axios 层统一拦截提示
  - 裸路由 `GET /health` 保持纯文本 `ok`（200），用于平台健康检查
- **注册/登录与安全性**
  - 登录/注册失败提示与后端校验一致，减少“前端放行但后端 400”的摩擦
  - 忘记密码返回统一说明，降低邮箱枚举风险

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
