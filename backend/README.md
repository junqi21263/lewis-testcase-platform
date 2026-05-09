# 后端（NestJS + Prisma）

全栈说明见 **[../README.md](../README.md)**；环境变量见 **[docs/development/ENVIRONMENT_VARIABLES.md](../docs/development/ENVIRONMENT_VARIABLES.md)**。

## 常用命令

```bash
pnpm install
cp .env.example .env

# 与生产一致的 Schema（推荐本地也用它，避免结构漂移）
pnpm exec prisma migrate deploy --schema=./prisma/schema.prod.prisma
pnpm exec prisma generate --schema=./prisma/schema.prod.prisma
pnpm prisma db seed

pnpm start:dev
```

- **Swagger**：http://localhost:3000/api/docs  
- **健康检查**：`GET /health`（纯文本）、`GET /api/health`（JSON）

新建迁移（改 `schema.prod.prisma` 后）：

```bash
pnpm exec prisma migrate dev --schema=./prisma/schema.prod.prisma --name <名称>
```

## 辅助脚本

| 脚本 | 用途 |
|------|------|
| `scripts/verify-auth-flow.ts` | 注册/登录流自测（需 `VERIFY_AUTH_TEST_PASSWORD` 等） |
| `scripts/smoke-enhancements.ts` | 联调冒烟（由 `pnpm integrate:smoke` 从前端触发） |
| `scripts/start-dev.sh` / `start-prod.sh` | 启动包装 |
| `scripts/health-check.sh` | 健康检查 |

## 目录摘要

- `src/modules/`：业务模块（auth、files、ai、testcases…）
- `prisma/schema.prod.prisma`：生产 PostgreSQL Schema
- `prisma/migrations/`：迁移 SQL
- `prisma/seed.ts`：种子数据

本地仍存在 `schema.prisma`（SQLite）等历史文件，**新环境与生产请以 `schema.prod.prisma` 为准**。
