# AI 测试用例生成平台 - 后端

基于 NestJS 的智能测试用例生成平台后端服务。

## 技术栈

- Node.js + NestJS + TypeScript
- Prisma ORM + PostgreSQL/SQLite
- JWT 鉴权
- 文件解析：pdf-parse、xlsx、mammoth、tesseract.js
- OpenAI API 集成

## 快速启动

### 开发环境

```bash
# 1. 安装依赖
pnpm install

# 2. 配置环境变量
cp .env.example .env
# 编辑 .env 文件，填写必要的配置

# 3. 启动数据库（使用 Docker）
docker-compose up -d

# 4. 初始化数据库
pnpm prisma migrate dev --name init
pnpm prisma db seed

# 5. 启动开发服务器
pnpm start:dev
```

### 生产环境

```bash
# 1. 构建项目
pnpm build

# 2. 使用 Docker 启动
docker-compose up -d

# 3. 查看日志
docker-compose logs -f app
```

### Docker 开发环境

```bash
# 使用开发环境的 Docker Compose
docker-compose -f docker-compose.dev.yml up -d

# 或者手动启动
docker-compose -f docker-compose.dev.yml up -d --build
```

## 环境变量配置

### 开发环境 (.env)

| 变量名 | 说明 | 示例 |
|--------|------|------|
| `DATABASE_URL` | 数据库连接串 | `file:./dev.db` (SQLite) |
| `JWT_SECRET` | JWT 签名密钥 | 随机字符串 |
| `JWT_EXPIRES_IN` | JWT 过期时间 | `7d` |
| `OPENAI_API_KEY` | OpenAI API Key | `sk-...` |
| `OPENAI_BASE_URL` | AI 接口地址 | `https://api.openai.com/v1` |
| `DEFAULT_AI_MODEL` | 默认 AI 模型 | `gpt-4o` |

### 生产环境 (.env.production)

| 变量名 | 说明 | 示例 |
|--------|------|------|
| `DATABASE_URL` | PostgreSQL 连接串 | `postgresql://user:pass@localhost:5432/db` |
| `JWT_SECRET` | JWT 签名密钥 | 随机32位字符串 |
| `OPENAI_API_KEY` | OpenAI API Key | `sk-...` |
| `UPLOAD_DIR` | 文件上传目录 | `./uploads` |
| `MAX_FILE_SIZE` | 最大文件大小 | `10485760` |

## 数据库管理

### 迁移管理

```bash
# 创建新迁移
pnpm prisma migrate dev --name <migration-name>

# 重置数据库（开发环境）
pnpm prisma migrate reset

# 推送生产环境迁移
pnpm prisma migrate deploy

# 查看数据库状态
pnpm prisma migrate status

# 回滚迁移
pnpm prisma migrate reset
```

### 数据库种子

```bash
# 运行种子数据
pnpm prisma db seed

# 查看数据库
pnpm prisma studio
```

## API 文档

启动服务后，访问以下地址查看 API 文档：

- 开发环境：http://localhost:3000/api/docs
- 生产环境：https://your-domain.com/api/docs

## 健康检查

应用提供健康检查端点：

- GET /api/health - 健康检查状态

## 部署

### Docker 部署

```bash
# 构建镜像
docker build -t testcase-platform-backend .

# 运行容器
docker run -p 3000:3000 testcase-platform-backend
```

### Railway 部署

项目已配置 Railway 部署，只需推送代码到 Railway 仓库即可自动部署。

## 项目结构

```
backend/
├── src/
│   ├── common/           # 公共模块
│   │   ├── filters/     # 异常过滤器
│   │   ├── guards/      # 路由守卫
│   │   └── interceptors/# 响应拦截器
│   ├── health.controller.ts  # 健康检查（/api/health）
│   ├── modules/         # 业务模块
│   │   ├── auth/        # 认证模块
│   │   ├── users/       # 用户模块
│   │   ├── teams/       # 团队模块
│   │   ├── files/       # 文件处理模块
│   │   ├── ai/          # AI 调用模块
│   │   ├── testcases/   # 测试用例模块
│   │   └── templates/   # 模板管理模块
│   └── prisma/          # 数据库服务
├── prisma/              # 数据库 Schema
├── scripts/             # 脚本文件
├── uploads/             # 文件上传目录
└── 配置文件...
```

## 默认账号

出于安全考虑，本项目 **不在文档中提供默认账号/密码**。

- 本地开发：请自行注册账号，或通过脚本/SQL 创建管理员
- 生产环境：请在部署环境（如 Railway）中按运维流程初始化管理员账号与权限

## 开发脚本

### 数据库初始化

```bash
# 初始化数据库（生产环境）
./scripts/init-db.sh

# 初始化数据库并运行种子数据
./scripts/init-db.sh --seed
```

### 启动脚本

```bash
# 启动开发环境
./scripts/start-dev.sh

# 启动生产环境
./scripts/start-prod.sh
```

### 健康检查

```bash
# 健康检查
./scripts/health-check.sh
```