# 开发指南

## 项目概述

AI 测试用例生成平台是一个全栈 Web 应用，包含前端 React 应用和后端 NestJS 服务。

## 开发环境设置

### 前置要求

- Node.js >= 18
- pnpm >= 8
- Docker & Docker Compose（可选）
- Git

### 1. 克隆项目

```bash
git clone <repository-url>
cd testcase-platform
```

### 2. 安装依赖

```bash
# 安装前端依赖
cd frontend
pnpm install
cd ..

# 安装后端依赖
cd backend
pnpm install
cd ..
```

### 3. 配置环境变量

#### 后端环境变量

```bash
cd backend
cp .env.example .env
# 编辑 .env 文件，配置数据库连接和 AI API Key
```

#### 前端环境变量

```bash
cd frontend
cp .env.example .env
# 编辑 .env 文件，配置后端 API 地址
```

### 4. 启动数据库（可选）

使用 Docker Compose 启动 PostgreSQL 和 Redis：

```bash
docker-compose up -d
```

### 5. 初始化数据库

```bash
cd backend
pnpm prisma migrate dev --name init
pnpm prisma db seed
```

### 6. 启动开发服务

```bash
# 终端1：启动后端（端口 3000）
cd backend
pnpm start:dev

# 终端2：启动前端（端口 5173）
cd frontend
pnpm dev
```

## 开发工作流

### 代码规范

- 使用 ESLint 和 Prettier 进行代码格式化
- 遵循 TypeScript 严格模式
- 组件使用函数式组件和 Hooks

### Git 工作流

1. 创建功能分支：`git checkout -b feature/new-feature`
2. 提交更改：`git commit -m "feat: add new feature"`
3. 推送到分支：`git push origin feature/new-feature`
4. 创建 Pull Request

### 数据库变更

1. 修改 `backend/prisma/schema.prisma`
2. 创建迁移：`pnpm prisma migrate dev --name descriptive-name`
3. 更新种子数据（如需要）：`backend/prisma/seed.ts`

### 前端开发

#### 组件开发

```tsx
import { Button } from '@/components/ui/button'
import { useState } from 'react'

export function MyComponent() {
  const [count, setCount] = useState(0)
  
  return (
    <div>
      <Button onClick={() => setCount(count + 1)}>
        Count: {count}
      </Button>
    </div>
  )
}
```

#### 状态管理

使用 Zustand 进行状态管理：

```ts
import { create } from 'zustand'

interface UserState {
  user: User | null
  setUser: (user: User) => void
  clearUser: () => void
}

export const useUserStore = create<UserState>((set) => ({
  user: null,
  setUser: (user) => set({ user }),
  clearUser: () => set({ user: null }),
}))
```

### 后端开发

#### 模块开发

```ts
import { Module } from '@nestjs/common'
import { UserService } from './user.service'
import { UserController } from './user.controller'

@Module({
  controllers: [UserController],
  providers: [UserService],
  exports: [UserService],
})
export class UserModule {}
```

#### API 开发

```ts
import { Controller, Get, Post, Body } from '@nestjs/common'
import { UserService } from './user.service'

@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get()
  findAll() {
    return this.userService.findAll()
  }

  @Post()
  create(@Body() createUserDto: CreateUserDto) {
    return this.userService.create(createUserDto)
  }
}
```

## 测试

### 前端测试

```bash
cd frontend
pnpm test
```

### 后端测试

```bash
cd backend
pnpm test
```

### 集成测试

```bash
# 使用 Docker Compose 启动完整环境
docker-compose -f docker-compose.full.yml up -d
```

## 部署

### 开发环境部署

```bash
# 使用 Docker Compose 开发环境
docker-compose -f docker-compose.dev.full.yml up -d
```

### 生产环境部署

```bash
# 使用 Docker Compose 生产环境
docker-compose -f docker-compose.full.yml up -d

# 或者使用 Railway（已配置）
git push origin main
```

## 常见问题

### 数据库连接问题

```bash
# 检查数据库状态
docker-compose ps

# 查看数据库日志
docker-compose logs postgres
```

### 前端构建问题

```bash
# 清理依赖并重新安装
cd frontend
rm -rf node_modules pnpm-lock.yaml
pnpm install
```

### 后端启动问题

```bash
# 检查端口占用
lsof -i :3000

# 重新生成 Prisma 客户端
cd backend
pnpm prisma generate
```

## 调试

### 前端调试

- 使用 React DevTools
- 使用浏览器开发者工具
- 查看网络请求

### 后端调试

- 使用 NestJS 调试模式
- 查看日志输出
- 使用 Prisma Studio 查看数据库

## 性能优化

### 前端优化

- 使用 React.memo 避免不必要的重渲染
- 使用 useMemo 和 useCallback 优化性能
- 代码分割和懒加载

### 后端优化

- 数据库查询优化
- 缓存策略
- API 响应压缩

## 安全考虑

- 使用 HTTPS
- 输入验证和过滤
- JWT token 安全
- 文件上传安全

## 监控和日志

- 应用日志记录
- 错误监控
- 性能监控