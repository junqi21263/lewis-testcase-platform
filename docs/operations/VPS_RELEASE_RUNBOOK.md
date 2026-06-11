# VPS 发布操作手册

适用范围：当前这台 VPS 上的两套环境。

- `develop`：`http://139.199.69.115:8083`
- `main`：`http://139.199.69.115`

当前推荐以 **CNB 预构建镜像 + VPS `docker compose pull/up`** 为准，避免在 VPS 上重复编译 `canvas`、字体和 Node 原生依赖。

这意味着：

1. 你在 Cursor 里改代码。
2. 你推送到 `cnb/develop` 或 `cnb/main`。
3. CNB 云构建成功。
4. 你执行仓库内对应环境的部署脚本。
5. 浏览器最后需要强制刷新。

## 零、推荐替代手工流程

为避免“本地代码是新的，但 VPS 上源码目录还是旧的”、以及 compose/env 文件混用，优先使用仓库内脚本：

```bash
scripts/ops/deploy-develop.sh frontend
scripts/ops/deploy-develop.sh all
scripts/ops/deploy-main.sh frontend
scripts/ops/deploy-main.sh all
```

默认 `DEPLOY_MODE=image`：脚本会先把仓库文件 `rsync` 到 VPS 对应目录，再拉取 CNB 预构建镜像并 `up -d --force-recreate`。

如果必须在 VPS 上本地构建，显式加：

```bash
DEPLOY_MODE=build scripts/ops/deploy-develop.sh frontend
DEPLOY_MODE=build scripts/ops/deploy-main.sh frontend
```

## 一、总原则

- 只在本地开发仓库改代码：`/Users/lewis/lewis_testcase_platform`
- 不在 VPS 上手改业务代码，VPS 只做构建、重建、验收
- `develop` 先验证，确认没问题再发 `main`
- 前端改完后，浏览器必须强刷一次，否则旧 chunk 可能继续命中

## 二、发布前要做什么

### develop

```bash
cd /Users/lewis/lewis_testcase_platform
git checkout develop
git status
git add .
git commit -m "your message"
git push cnb develop
```

### main

```bash
cd /Users/lewis/lewis_testcase_platform
git checkout main
git status
git add .
git commit -m "your message"
git push cnb main
```

CNB 构建成功只代表仓库和构建产物更新了，**不代表 VPS 页面已经更新**。

## 三、develop 发布命令

推荐入口：

```bash
cd /Users/lewis/lewis_testcase_platform

scripts/ops/deploy-develop.sh frontend
scripts/ops/deploy-develop.sh backend
scripts/ops/deploy-develop.sh all
scripts/ops/deploy-develop.sh env
```

固定配置由脚本管理：

- 目录：`/opt/lewis_testcase_platform_dev`
- env：`.env.development`
- compose：`docker-compose.ghcr.yml + docker-compose.dev.override.yml`
- 镜像：`docker.cnb.cool/lewis-test/lewis-testcase-platform/*:dev`
- 端口：frontend `8083`，backend `3000`，postgres `5433`，redis `6380`

### 1. 全量发布：前端 + 后端

```bash
ssh testcase-server

cd /opt/lewis_testcase_platform_dev

export STACK_PREFIX=testcase_dev
export FRONTEND_HOST_PORT=8083
export POSTGRES_HOST_PORT=5433
export REDIS_HOST_PORT=6380

sudo -E docker compose -f docker-compose.full.yml -f docker-compose.dev.override.yml --env-file .env.development build frontend backend
sudo -E docker compose -f docker-compose.full.yml -f docker-compose.dev.override.yml --env-file .env.development up -d --force-recreate frontend backend

curl -s http://127.0.0.1:8083/health
```

### 2. 只发布前端

适用于 UI、页面、路由、样式、前端 nginx 配置改动。

```bash
ssh testcase-server

cd /opt/lewis_testcase_platform_dev

export STACK_PREFIX=testcase_dev
export FRONTEND_HOST_PORT=8083
export POSTGRES_HOST_PORT=5433
export REDIS_HOST_PORT=6380

sudo -E docker compose -f docker-compose.full.yml -f docker-compose.dev.override.yml --env-file .env.development build frontend
sudo -E docker compose -f docker-compose.full.yml -f docker-compose.dev.override.yml --env-file .env.development up -d --force-recreate frontend

curl -I http://127.0.0.1:8083/ai-analysis
curl -I http://127.0.0.1:8083/assets/not-real-asset.js
```

### 3. 只发布后端

适用于接口、AI、上传解析、worker、NestJS、Prisma 逻辑改动。

```bash
ssh testcase-server

cd /opt/lewis_testcase_platform_dev

export STACK_PREFIX=testcase_dev
export FRONTEND_HOST_PORT=8083
export POSTGRES_HOST_PORT=5433
export REDIS_HOST_PORT=6380

sudo -E docker compose -f docker-compose.full.yml -f docker-compose.dev.override.yml --env-file .env.development build backend
sudo -E docker compose -f docker-compose.full.yml -f docker-compose.dev.override.yml --env-file .env.development up -d --force-recreate backend

curl -s http://127.0.0.1:3000/health
```

### 4. 只改了环境变量

适用于 `.env.development`、COS、Hunyuan、CORS、上传限制、OCR/PDF 开关改动。

```bash
ssh testcase-server

cd /opt/lewis_testcase_platform_dev

export STACK_PREFIX=testcase_dev
export FRONTEND_HOST_PORT=8083
export POSTGRES_HOST_PORT=5433
export REDIS_HOST_PORT=6380

sudo -E docker compose -f docker-compose.full.yml -f docker-compose.dev.override.yml --env-file .env.development up -d --force-recreate frontend backend
```

## 四、main 发布命令

推荐入口：

```bash
cd /Users/lewis/lewis_testcase_platform

scripts/ops/deploy-main.sh frontend
scripts/ops/deploy-main.sh backend
scripts/ops/deploy-main.sh all
scripts/ops/deploy-main.sh env
```

固定配置由脚本管理：

- 目录：`/opt/lewis_testcase_platform`
- env：`.env`
- compose：`docker-compose.ghcr.yml`
- 镜像：`docker.cnb.cool/lewis-test/lewis-testcase-platform/*:latest`
- 端口：frontend `80`，postgres `5432`，redis `6379`

### 1. 全量发布：前端 + 后端

```bash
ssh testcase-server

cd /opt/lewis_testcase_platform

export STACK_PREFIX=testcase
export FRONTEND_HOST_PORT=80
export POSTGRES_HOST_PORT=5432
export REDIS_HOST_PORT=6379

sudo -E docker compose -f docker-compose.full.yml --env-file .env build frontend backend
sudo -E docker compose -f docker-compose.full.yml --env-file .env up -d --force-recreate frontend backend

curl -s http://127.0.0.1/health
```

### 2. 只发布前端

```bash
ssh testcase-server

cd /opt/lewis_testcase_platform

export STACK_PREFIX=testcase
export FRONTEND_HOST_PORT=80
export POSTGRES_HOST_PORT=5432
export REDIS_HOST_PORT=6379

sudo -E docker compose -f docker-compose.full.yml --env-file .env build frontend
sudo -E docker compose -f docker-compose.full.yml --env-file .env up -d --force-recreate frontend

curl -I http://127.0.0.1/ai-analysis
curl -I http://127.0.0.1/assets/not-real-asset.js
```

### 3. 只发布后端

```bash
ssh testcase-server

cd /opt/lewis_testcase_platform

export STACK_PREFIX=testcase
export FRONTEND_HOST_PORT=80
export POSTGRES_HOST_PORT=5432
export REDIS_HOST_PORT=6379

sudo -E docker compose -f docker-compose.full.yml --env-file .env build backend
sudo -E docker compose -f docker-compose.full.yml --env-file .env up -d --force-recreate backend

curl -s http://127.0.0.1:3000/health
```

### 4. 只改了环境变量

```bash
ssh testcase-server

cd /opt/lewis_testcase_platform

export STACK_PREFIX=testcase
export FRONTEND_HOST_PORT=80
export POSTGRES_HOST_PORT=5432
export REDIS_HOST_PORT=6379

sudo -E docker compose -f docker-compose.full.yml --env-file .env up -d --force-recreate frontend backend
```

## 五、数据库 / Prisma 变更

如果这次改动包含 Prisma migration，不要只重启容器，先执行迁移。

### develop

```bash
ssh testcase-server
cd /opt/lewis_testcase_platform_dev
sudo docker compose -f docker-compose.full.yml -f docker-compose.dev.override.yml --env-file .env.development run --rm backend npx prisma migrate deploy --schema=./backend/prisma/schema.prod.prisma
```

### main

```bash
ssh testcase-server
cd /opt/lewis_testcase_platform
sudo docker compose -f docker-compose.full.yml --env-file .env run --rm backend npx prisma migrate deploy --schema=./backend/prisma/schema.prod.prisma
```

迁移完成后，再执行对应环境的 `build backend` 和 `up -d --force-recreate backend`。

## 六、发布后必须做什么

### 1. 浏览器强制刷新

- Mac：`Cmd + Shift + R`
- Windows：`Ctrl + F5`

前端尤其是懒加载页面，如果不强刷，旧缓存会继续引用旧 chunk。

### 2. 最低验收

#### develop

```bash
curl -s http://127.0.0.1:8083/health
curl -I http://127.0.0.1:8083/ai-analysis
curl -I http://127.0.0.1:8083/assets/not-real-asset.js
```

#### main

```bash
curl -s http://127.0.0.1/health
curl -I http://127.0.0.1/ai-analysis
curl -I http://127.0.0.1/assets/not-real-asset.js
```

正确结果：

- `/health` 返回 `ok`
- `/ai-analysis` 返回 `200`
- `/assets/not-real-asset.js` 返回 `404`

如果第三条不是 `404`，说明 nginx 还在把缺失静态资源 fallback 成 `index.html`，白屏风险还在。

## 七、最常见的误区

### 1. “我在 Cursor 改完并 push 了，为什么页面还是旧的？”

因为 VPS 还没有执行：

```bash
docker compose build
docker compose up -d --force-recreate
```

### 2. “CNB 构建成功了，为什么页面还是旧的？”

因为当前 VPS 实际跑的是本地 compose 构建栈，不是“CNB 成功后直接自动替换线上容器”的纯镜像拉取模式。

### 3. “页面还是白屏，但接口是通的”

优先检查：

```bash
curl -I http://127.0.0.1/ai-analysis
curl -I http://127.0.0.1/assets/not-real-asset.js
```

如果不存在的静态资源不是 `404`，先修前端 nginx 配置。

## 八、最短命令

### develop 前端更新

```bash
ssh testcase-server
cd /opt/lewis_testcase_platform_dev
export STACK_PREFIX=testcase_dev FRONTEND_HOST_PORT=8083 POSTGRES_HOST_PORT=5433 REDIS_HOST_PORT=6380
sudo -E docker compose -f docker-compose.full.yml -f docker-compose.dev.override.yml --env-file .env.development build frontend
sudo -E docker compose -f docker-compose.full.yml -f docker-compose.dev.override.yml --env-file .env.development up -d --force-recreate frontend
```

### main 前端更新

```bash
ssh testcase-server
cd /opt/lewis_testcase_platform
export STACK_PREFIX=testcase FRONTEND_HOST_PORT=80 POSTGRES_HOST_PORT=5432 REDIS_HOST_PORT=6379
sudo -E docker compose -f docker-compose.full.yml --env-file .env build frontend
sudo -E docker compose -f docker-compose.full.yml --env-file .env up -d --force-recreate frontend
```

## 九、磁盘自动清理

仓库内已提供两份脚本：

- `scripts/ops/vps-disk-guard.sh`
- `scripts/ops/install-vps-disk-guard.sh`

安装到 VPS 并设置为超过 75% 自动清理：

```bash
cd /Users/lewis/lewis_testcase_platform
bash scripts/ops/install-vps-disk-guard.sh 75
```

安装完成后，VPS 每 10 分钟检查一次根分区占用。超过阈值后会执行：

- `docker builder prune`
- `docker image prune`
- `docker container prune`
- `docker network prune`
- `journalctl --vacuum-time=7d`
- `apt-get clean`
- 清理旧的 `/tmp`、`/var/tmp`

手动立即执行一次：

```bash
ssh testcase-server 'sudo DISK_GUARD_THRESHOLD_PERCENT=75 /usr/local/bin/vps-disk-guard.sh'
```
