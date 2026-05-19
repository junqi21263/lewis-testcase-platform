# VPS：开发 + 生产双目录、环境变量同步与应用

同一台机器上常见 **两套部署目录**（与 [`scripts/ci/cnb-deploy-vps.sh`](../../scripts/ci/cnb-deploy-vps.sh) 默认一致）：

| 环境 | 默认目录 | Compose 使用的 env 文件 | 说明 |
|------|-----------|-------------------------|------|
| **开发** | `/opt/lewis_testcase_platform_dev` | **`.env.development`** | 与 `develop` 分支部署对应；常合并 `docker-compose.dev.override.yml` |
| **生产** | `/opt/lewis_testcase_platform` | **`.env`** | 与 `main` 分支部署对应 |

CI **不会** rsync 覆盖服务器上的 `.env` / `.env.*`（见 `cnb-deploy-vps.sh` 的 `--exclude`），因此 **改密钥与业务开关必须在 VPS 上各自编辑** 对应文件。

`docker-compose.ghcr.yml` 里 `backend` 的 `environment` 为 **白名单透传**：只有 compose 里列出的变量名才会从 env 文件进入容器。新增一类配置（如腾讯云 OCR）时，除改 `.env` 外还需 **仓库内 compose 已包含该变量名**（否则仅写 `.env` 也不会进容器）。更新 compose 后要在 **两个目录分别 `git pull`**（若各为一份克隆），再 `up -d` 应用。

**开发栈注意**：`docker-compose.dev.override.yml` 对 `backend.environment` 为**整块覆盖**（与 `ghcr` 合并后仅以 override 为准）。因此 **混元 `HUNYUAN_*`、运行时 `MM_*` 等必须在 override 里显式列出**，仅写在 `docker-compose.ghcr.yml` 或仅写 `.env.development` 都不会进入 **`testcase_dev_backend`** 容器。

---

## 一、两边「一起改、一起生效」的推荐做法

1. **列清单**：在 `backend/.env.example` 或团队文档里记下本次要加的变量名（如 `TENCENT_OCR_HTTP_URL`）。
2. **先改开发**：编辑 **`/opt/lewis_testcase_platform_dev/.env.development`**，保存后按下文 **第三节（开发）** 重启。
3. **再改生产**：把 **同一批变量名与取值策略**（生产可用不同密钥/URL）写入 **`/opt/lewis_testcase_platform/.env`**，保存后按下文 **第四节（生产）** 重启。
4. **不要用未被 compose 引用的文件当唯一来源**：例如仅写 `/home/ubuntu/backend.dev.env` 而从未在 compose 里 `env_file` 指向它，则容器 **读不到**。请把内容合并进上表对应文件，或自行改 compose 增加 `env_file`（需团队约定）。

可选：用 `diff` 比对两份 env 里「键是否一致」（勿把含密钥的 diff 贴到公开处）：

```bash
diff -u <(grep -E '^[A-Z0-9_]+=' /opt/lewis_testcase_platform_dev/.env.development | sort) \
      <(grep -E '^[A-Z0-9_]+=' /opt/lewis_testcase_platform/.env | sort) | head -80
```

---

## 二、更新仓库里的 compose（两个目录都要做）

若流水线或你本地刚合并了新的 `docker-compose*.yml`：

```bash
sudo git -C /opt/lewis_testcase_platform_dev pull
sudo git -C /opt/lewis_testcase_platform pull
```

（若目录属主已是当前用户，可去掉 `sudo`。）

---

## 三、开发环境：使 `.env.development` 生效

在 **`/opt/lewis_testcase_platform_dev`** 下执行。镜像变量 **必须** 与当前/registry 实际存在的镜像一致（避免 `manifest unknown`）。优先从 **已在跑的容器** 复制：

```bash
cd /opt/lewis_testcase_platform_dev

BE_IMG="$(sudo docker inspect testcase_dev_backend --format '{{.Config.Image}}' 2>/dev/null || true)"
FE_IMG="$(sudo docker inspect testcase_dev_frontend --format '{{.Config.Image}}' 2>/dev/null || true)"
echo "BACKEND_IMAGE=$BE_IMG"
echo "FRONTEND_IMAGE=$FE_IMG"
```

若 `BE_IMG` / `FE_IMG` 为空，说明容器尚未创建或名称不同，请用 `sudo docker ps --format '{{.Names}}\t{{.Image}}'` 查看后手动赋值再执行 `up -d`。若首次部署尚无容器，则使用 CI 写入的镜像（如 CNB `PRESET_*`）或仓库中 **真实存在** 的 `ghcr.io/.../backend:<tag>`，避免 `manifest unknown`。

**重建并应用环境**（与 [`remote-deploy-ghcr.sh`](../../scripts/ci/remote-deploy-ghcr.sh) 的开发分支逻辑对齐）：

```bash
cd /opt/lewis_testcase_platform_dev

sudo env \
  DOCKER_BUILDKIT=1 \
  STACK_PREFIX="${STACK_PREFIX:-testcase_dev}" \
  FRONTEND_HOST_PORT=8080 \
  POSTGRES_HOST_PORT=5433 \
  REDIS_HOST_PORT=6380 \
  BACKEND_IMAGE="$BE_IMG" \
  FRONTEND_IMAGE="$FE_IMG" \
  docker compose -f docker-compose.ghcr.yml -f docker-compose.dev.override.yml \
  --env-file .env.development \
  up -d
```

仅改 env、不换镜像时，可只起后端（略快）：

```bash
sudo env DOCKER_BUILDKIT=1 STACK_PREFIX=testcase_dev FRONTEND_HOST_PORT=8080 \
  POSTGRES_HOST_PORT=5433 REDIS_HOST_PORT=6380 \
  BACKEND_IMAGE="$BE_IMG" FRONTEND_IMAGE="$FE_IMG" \
  docker compose -f docker-compose.ghcr.yml -f docker-compose.dev.override.yml \
  --env-file .env.development \
  up -d backend
```

**自检（变量是否进容器）**：

```bash
sudo docker exec testcase_dev_backend sh -c 'env | grep -E "TENCENT|PDF_TENCENT|IMAGE_OCR|COS_" | sort'
```

**COS 签名失败但 `.env` 看起来正确时**：常见原因是 compose 用 `COS_SECRET_KEY=${COS_SECRET_KEY}` 插值时把密钥里的 `$` 展开掉了。仓库已在 `docker-compose.ghcr.yml` 用 `env_file` 原样注入 COS 四项。请对比文件与容器内**长度/后四位**（勿贴完整密钥）：

```bash
cd /opt/lewis_testcase_platform_dev
bash scripts/diagnose-cos-vps.sh .env.development testcase_dev_backend
curl -s http://127.0.0.1:3000/api/health/cos
```

改 env 后必须 **`up -d --force-recreate backend`**，仅 `restart` 不会刷新环境变量。

---

## 四、生产环境：使 `.env` 生效

在 **`/opt/lewis_testcase_platform`** 下执行（**无** `dev.override`，端口为 80 / 5432 / 6379）：

```bash
cd /opt/lewis_testcase_platform

BE_IMG="$(sudo docker inspect testcase_backend --format '{{.Config.Image}}' 2>/dev/null || true)"
FE_IMG="$(sudo docker inspect testcase_frontend --format '{{.Config.Image}}' 2>/dev/null || true)"
# 若你们 STACK_PREFIX 有自定义，把容器名前缀改成实际 docker ps 里的名字
```

若生产容器名不是 `testcase_backend`，用 `sudo docker ps --format '{{.Names}}\t{{.Image}}'` 查看后替换 `docker inspect` 的目标名。

**应用**：

```bash
cd /opt/lewis_testcase_platform

sudo env \
  DOCKER_BUILDKIT=1 \
  STACK_PREFIX="${STACK_PREFIX:-testcase}" \
  FRONTEND_HOST_PORT=80 \
  POSTGRES_HOST_PORT=5432 \
  REDIS_HOST_PORT=6379 \
  BACKEND_IMAGE="$BE_IMG" \
  FRONTEND_IMAGE="$FE_IMG" \
  docker compose -f docker-compose.ghcr.yml \
  --env-file .env \
  up -d
```

**自检**：

```bash
curl -fsS http://127.0.0.1/api/health
sudo docker exec testcase_backend sh -c 'env | grep -E "TENCENT|PDF_TENCENT|IMAGE_OCR|COS_" | sort'
```

（若 `STACK_PREFIX` 不同，`testcase_backend` 改为实际后端容器名。）

---

## 五、后续日常：你改了 env 之后最短路径

| 场景 | 操作 |
|------|------|
| 只改了 **开发** `.env.development` | 第三节中 `up -d` 或 `up -d backend` |
| 只改了 **生产** `.env` | 第四节中 `up -d` |
| 两边都改了同一批变量 | 分别在两个目录执行对应 `up -d`（先 dev 验证再 prod 较稳妥） |
| 仓库 **compose 有变更** | 第二节 `git pull` 后，再在两边各执行一次 `up -d` |
| 想确认当前用的镜像 | `sudo docker ps --format '{{.Names}}\t{{.Image}}'` |

**说明**：`chmod` 与配置是否生效无关；密钥文件可单独 `chmod 600` 降低泄露面。

---

## 六、与 CI 自动部署的关系

推送 `develop` / `main` 触发 CNB 时，远端会执行 `remote-deploy-ghcr.sh`：已含 `pull` + `up -d`。你 **仅在服务器改 `.env`** 后，若不想等下一次流水线，在对应目录 **手动执行本文第三节或第四节** 即可让新环境变量生效。
