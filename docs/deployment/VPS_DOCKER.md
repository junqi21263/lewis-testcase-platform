# 自托管：Docker Compose 全栈（VPS）

默认路径：**自有云服务器** + **`docker-compose.full.yml`**：前端 Nginx（80）+ 后端 + PostgreSQL + Redis，单入口，`/api` 反代到后端。

## 架构与端口

| 组件 | 说明 |
|------|------|
| **入口** | 宿主机 **80** → `frontend` 容器（静态 + 反代） |
| **裸探活** | `GET http://<服务器>/health` → 后端 `GET /health`（纯文本 `ok`） |
| **业务探活** | `GET http://<服务器>/api/health` → JSON |
| **PostgreSQL** | 默认 **`127.0.0.1:5432`** 映射，**勿对 0.0.0.0 开放** |
| **后端** | 不映射宿主机端口，容器内 `backend:3000` |

### SSE / 流式生成

`frontend/nginx.conf.template` 对 `/api/ai/generate/stream` 已配置 `proxy_buffering off`、`proxy_request_buffering off` 等。若前有负载均衡/CDN，空闲超时建议 ≥ **60s**，避免 `ERR_INCOMPLETE_CHUNKED_ENCODING`。

## 首次部署

1. 安装 Docker Engine 与 Compose 插件；安全组放行 **80**（HTTPS 再开 **443**）。
2. 将仓库放到部署目录（如 `/opt/<your-path>`）。
3. 与 `docker-compose.full.yml` **同级**：`cp docker-compose.full.env.example .env`，填写 `DB_PASSWORD`、`DATABASE_URL`、`JWT_SECRET`、`FRONTEND_URL`、`CORS_ORIGINS`、`OPENAI_*` 等。
4. `docker compose -f docker-compose.full.yml up -d --build`
5. 冒烟：仓库根目录 `bash scripts/smoke.sh` 或 `curl -fsS http://127.0.0.1/api/health`

迁移由镜像启动流程执行；确保 `DATABASE_URL` 指向 compose 内 `postgres` 服务。

## 故障排查：页面完全打不开（连接被拒绝 / 超时）

1. `docker compose -f docker-compose.full.yml ps`：若 **`frontend` 未在运行**，常见原因是 **后端未通过健康检查**（迁移失败、`JWT_SECRET`/`DATABASE_URL` 等）。先看 `docker compose -f docker-compose.full.yml logs backend --tail 200`。
2. 宿主机探活：`curl -fsS http://127.0.0.1/health`（经 Nginx 到后端裸 `/health`，应返回 `ok`）、`curl -fsS http://127.0.0.1/api/health`（JSON）。
3. 前端已配置为 **仅等待后端容器启动**（`service_started`），避免「后端一时起不来则整站 80 无服务」；若静态页能开但登录/接口报错，仍以后端日志为准。

## CI（GitHub Actions）

在仓库 Secrets/Variables 配置 SSH 与路径占位符（如 `<DEPLOY_SSH_HOST>`、`<DEPLOY_PATH>`），**勿**在文档中写真实主机与密钥。

推送 **`main`** 时 `.github/workflows/deploy-vps.yml`：Runner 构建前端 `dist/` → rsync → 服务器上 `docker compose -f docker-compose.full.yml up -d --build` → `scripts/smoke.sh`。可选 Variables：`VITE_API_BASE_URL`、`VITE_APP_NAME`（默认 `/api`）。

## 相关文件

- `docker-compose.full.yml`、`docker-compose.full.env.example`
- 根目录其它 Compose 说明见 [COMPOSE_FILES.md](COMPOSE_FILES.md)
- `scripts/smoke.sh`、`docs/cnb-migration.md`（CNB 迁移）
