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

同一 VPS 上 **开发目录 + 生产目录** 如何同步改 env、如何 `git pull` 与手动 `docker compose` 应用，见 [VPS_GHCR_DUAL_ENV.md](VPS_GHCR_DUAL_ENV.md)。

更细的上线步骤见 [VPS_DOCKER.md](VPS_DOCKER.md)。

## 为何 Compose 留在仓库根目录

`docker-compose.full.yml` 等文件里 **`build.context`**（如 `context: .` + `dockerfile: backend/Dockerfile`）以及 **`volumes`**（如 `./backend/uploads`）均以 **compose 文件所在目录** 为基准。若把整个 stack 挪到子目录（例如 `deploy/`），需要同步改写所有相对路径并更新所有脚本与文档中的 `-f` 路径，易漏改。**因此 stack 定义保留在根目录**；仅依赖服务仍可用根目录 `docker-compose.yml` 单独拉起。
