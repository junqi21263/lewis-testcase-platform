# AI 测试用例生成平台 - 前端

基于 React 18 的智能测试用例生成平台前端应用。

## 技术栈

- React 18 + TypeScript + Vite
- Shadcn UI + Tailwind CSS
- Zustand 状态管理
- React Router v6
- TanStack Table + Tiptap 富文本编辑器

## 快速启动

### 开发环境

```bash
# 1. 安装依赖
pnpm install

# 2. 配置环境变量
cp .env.example .env
# 编辑 .env 文件，配置后端 API 地址

# 3. 启动开发服务器
pnpm dev
```

访问 http://localhost:5173

### 生产环境

```bash
# 1. 构建项目
pnpm build

# 2. 预览构建结果
pnpm preview
```

### Docker 部署

```bash
# 使用 Docker Compose
docker-compose up -d

# 或者直接构建
docker build -t testcase-platform-frontend .
docker run -p 80:80 testcase-platform-frontend
```

## 环境变量配置

### 开发环境 (.env)

```env
VITE_API_BASE_URL=http://localhost:3000/api
VITE_APP_NAME=AI 测试用例平台
```

### 生产环境 (.env.production)

```env
VITE_API_BASE_URL=https://your-domain.com/api
VITE_APP_NAME=AI 测试用例平台
```

## 项目结构

```
frontend/
├── src/
│   ├── api/             # API 请求层
│   │   ├── auth.ts     # 认证相关 API
│   │   ├── user.ts     # 用户相关 API
│   │   ├── testcase.ts # 测试用例 API
│   │   └── file.ts     # 文件处理 API
│   ├── components/      # 公共组件
│   │   ├── layout/      # 布局组件
│   │   │   ├── Header.tsx
│   │   │   ├── Sidebar.tsx
│   │   │   └── Footer.tsx
│   │   └── ui/          # 基础 UI 组件
│   │       ├── Button.tsx
│   │       ├── Input.tsx
│   │       ├── Dialog.tsx
│   │       └── ...
│   ├── hooks/           # 自定义 Hooks
│   │   ├── useAuth.ts  # 认证 Hook
│   │   ├── useApi.ts   # API 请求 Hook
│   │   └── useTestcase.ts # 测试用例 Hook
│   ├── pages/           # 页面组件
│   │   ├── Auth/        # 认证页面
│   │   ├── Dashboard/   # 仪表板
│   │   ├── Testcases/   # 测试用例管理
│   │   ├── Teams/       # 团队管理
│   │   └── Settings/    # 设置页面
│   ├── store/           # Zustand 状态
│   │   ├── auth.ts     # 认证状态
│   │   ├── user.ts     # 用户状态
│   │   └── testcase.ts  # 测试用例状态
│   ├── types/           # TypeScript 类型
│   │   ├── auth.ts     # 认证相关类型
│   │   ├── user.ts     # 用户相关类型
│   │   ├── testcase.ts  # 测试用例相关类型
│   │   └── api.ts      # API 响应类型
│   └── utils/           # 工具函数
│       ├── api.ts      # API 工具
│       ├── format.ts   # 格式化工具
│       └── validation.ts # 验证工具
├── public/              # 静态资源
└── 配置文件...
```

## 主要功能

### 1. 用户认证
- 登录/注册
- JWT Token 管理
- 权限控制

### 2. 团队管理
- 创建团队
- 邀请成员
- 权限分配

### 3. 测试用例管理
- 创建测试用例集
- 编写测试用例
- AI 辅助生成
- 用例导出

### 4. 文件处理
- 文件上传
- 多格式解析（PDF、Excel、Word）
- 图片 OCR 识别

### 5. AI 功能
- 测试用例 AI 生成
- 智能模板匹配
- 多模型支持

## 开发指南

### 组件开发

使用 Shadcn UI 组件库：

```tsx
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export function MyComponent() {
  return (
    <div>
      <Input placeholder="输入内容" />
      <Button>点击按钮</Button>
    </div>
  )
}
```

### 状态管理

使用 Zustand 进行状态管理：

```ts
import { create } from 'zustand'
import { devtools } from 'zustand/middleware'

interface AuthState {
  user: User | null
  login: (user: User) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>()(
  devtools(
    (set) => ({
      user: null,
      login: (user) => set({ user }),
      logout: () => set({ user: null }),
    }),
    { name: 'auth' }
  )
)
```

### API 调用

使用 axios 进行 API 调用：

```ts
import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
})

// 请求拦截器
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// 响应拦截器
api.interceptors.response.use(
  (response) => response.data,
  (error) => {
    if (error.response?.status === 401) {
      // 处理 token 过期
      localStorage.removeItem('token')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)
```

## 部署

### Vercel 部署

1. 将代码推送到 GitHub
2. 在 Vercel 中导入项目
3. 配置环境变量
4. 部署

### Docker 部署

```bash
# 构建镜像
docker build -t testcase-platform-frontend .

# 运行容器
docker run -p 80:80 testcase-platform-frontend
```

### 传统服务器部署

```bash
# 构建项目
pnpm build

# 将 dist 目录上传到服务器
# 使用 nginx 配置静态文件服务
```

## 环境变量

### 必需变量

```env
VITE_API_BASE_URL=https://your-backend-api.com/api
VITE_APP_NAME=AI 测试用例平台
```

### 可选变量

```env
VITE_APP_VERSION=1.0.0
VITE_APP_ENV=production
```

## 浏览器支持

- Chrome >= 90
- Firefox >= 88
- Safari >= 14
- Edge >= 90

## 开发脚本

```bash
# 开发服务器
pnpm dev

# 构建项目
pnpm build

# 预览构建结果
pnpm preview

# 代码检查
pnpm lint

# 代码格式化
pnpm format
```

## 贡献指南

1. Fork 项目
2. 创建功能分支
3. 提交更改
4. 推送到分支
5. 创建 Pull Request

## 许可证

MIT License