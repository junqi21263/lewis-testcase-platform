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
| `JWT_SECRET` | JWT 签名密钥 | 随机32位字符串 |
| `JWT_EXPIRES_IN` | JWT 过期时间 | `7d` |
| `OPENAI_API_KEY` | OpenAI API Key | `sk-...` |
| `OPENAI_BASE_URL` | AI 接口地址（兼容其他模型） | `https://api.openai.com/v1` |
| `DEFAULT_AI_MODEL` | 默认 AI 模型 | `gpt-4o` |
| `UPLOAD_DIR` | 文件上传目录 | `./uploads` |
| `MAX_FILE_SIZE` | 最大文件大小（字节） | `10485760` |

### 前端 `frontend/.env`

| 变量名 | 说明 | 示例 |
|--------|------|------|
| `VITE_API_BASE_URL` | 后端 API 地址 | `http://localhost:3000/api` |
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
│   │   │   ├── users/       # 用户模块
│   │   │   ├── teams/       # 团队模块
│   │   │   ├── files/       # 文件模块
│   │   │   ├── ai/          # AI 调用模块
│   │   │   ├── testcases/   # 用例管理模块
│   │   │   └── templates/   # 模板管理模块
│   │   └── prisma/          # Prisma 服务
│   └── prisma/
│       └── schema.prisma    # 数据库 Schema
└── docker-compose.yml
```

## 默认账号

种子数据初始化后默认管理员：
- 邮箱：`admin@example.com`
- 密码：`Admin@123456`
