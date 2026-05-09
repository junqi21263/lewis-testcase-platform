# 仓库根目录 Compose 文件一览

避免在根目录看到多个 `docker-compose*.yml` 时混淆：各文件职责如下。

| 文件 | 用途 |
|------|------|
| `docker-compose.yml` | 仅 **PostgreSQL + Redis**，供本机 `pnpm dev` / `pnpm start:dev` 时配合 `backend/.env` 使用。 |
| `docker-compose.full.yml` | **生产形态全栈**：前端 Nginx 镜像 + 后端镜像（Dockerfile 构建）+ Postgres + Redis。 |
| `docker-compose.ghcr.yml` | 与 `full` 拓扑相同，但 **frontend/backend 使用预构建镜像**（`FRONTEND_IMAGE` / `BACKEND_IMAGE`），VPS 上不做 `docker build`。 |
| `docker-compose.dev.override.yml` | **补丁文件**：与 `full` 或 `ghcr` **合并**（`-f ... -f ...`），用于开发端口、暴露后端端口、`NODE_ENV=development` 等。CI 在 develop 部署时常与 `full` 合并。 |
| `docker-compose.dev.full.yml` | **备选开发全栈**：`backend/Dockerfile.dev` + 源码挂载热更新；与 override 链路不同，按需选用。 |

环境变量模板统一为 **`docker-compose.full.env.example`**（复制为 `.env` 或 `.env.development`）。

更细的上线步骤见 [VPS_DOCKER.md](VPS_DOCKER.md)。
