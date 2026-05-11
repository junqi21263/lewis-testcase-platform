# 将仓库迁入腾讯云 CNB（cnb.cool）

本文说明如何把代码与 CI 从 GitHub 迁到 CNB，并与现有 VPS + GHCR/国内镜像仓部署衔接。

## 1. 在 CNB 创建组织与空仓库

在 [cnb.cool](https://cnb.cool) 创建根组织与目标仓库（名称可与 GitHub 不同）。

## 2. 迁入代码

**重要：** CNB **不提供 SSH 克隆/推送**（官方说明见 [Git 地址与认证](https://docs.cnb.cool/zh/guide/git-access.html)）。远程须用 **HTTPS**，用户名固定 **`cnb`**，密码须为 **[个人访问令牌](https://cnb.cool/profile/token)**（**不是**仓库里的「[部署令牌](https://docs.cnb.cool/zh/guide/deploy-key.html)」——部署令牌**只读**，用于拉代码；用于 `git push` 会 **403**）。

任选其一：

- **官方迁移镜像**：例如使用 `cnbcool/code-import`，配置 GitHub Token、CNB Token、根组织等，将 GitHub 侧仓库批量导入（参见 CNB 文档与社区「迁移工具」文章）。
- **裸克隆推送**（HTTPS 示例）：

```bash
git clone --mirror git@github.com:OWNER/REPO.git
cd REPO.git
git remote add cnb https://cnb.cool/GROUP/REPO.git
git -c http.extraHeader="AUTHORIZATION: Basic $(echo -n 'cnb:YOUR_CNB_TOKEN' | base64)" push cnb --mirror
```

或在交互环境下：`git push cnb --mirror`，提示用户名填 **`cnb`**，密码填 **令牌**。

之后在常用工作副本里：

```bash
git remote add cnb https://cnb.cool/lewis-test/lewis-testcase-platform.git
git push -u cnb develop
```

若曾误加 `git@cnb.cool:...`，请改为：`git remote set-url cnb https://cnb.cool/lewis-test/lewis-testcase-platform.git`。

## 3. 开通流水线并配置密钥/变量

仓库根目录已有 `.cnb.yml`，推送 `develop`/`main` 会执行 `scripts/ci/cnb-deploy-vps.sh`。

在 CNB 网页：**仓库 → 设置 → 左侧「云原生构建」**（或同类「流水线密钥 / 变量」入口）为构建注入密钥与变量。名称尽量与 GitHub **Secrets / Variables** 一致，便于对照迁移：

| 用途 | 建议名称 |
| --- | --- |
| SSH 部署 | `SSH_HOST`, `SSH_USER`, `SSH_KEY`，可选 `SSH_PORT`；**开发机**若与生产拆分时可在密钥文件中使用 `DEV_SSH_HOST` / `DEV_SSH_USER` / `DEV_SSH_KEY` / `DEV_SSH_PORT`（`.cnb.yml` 的 develop 流水线会优先读这些，见 `scripts/ci/cnb-require-ssh-deploy-env.sh`） |
| 向 GHCR 推送镜像（可选；不配则流水线用 **CNB 内置制品库** + `CNB_TOKEN`） | `GHCR_PUSH_TOKEN`、`GHCR_LOGIN_USER` |
| VPS 拉 GHCR（私有） | `GHCR_PULL_TOKEN`（可选） |
| VPS 拉 CNB 制品（私有或需登录时） | `CNB_REGISTRY_PULL_TOKEN`（可选；不配则脚本会传当次流水线的 `CNB_TOKEN`） |
| 国内镜像同步 | `DEPLOY_PULL_FROM_MIRROR=true` + `CONTAINER_MIRROR_*` 变量（与 GitHub 一致） |
| 路径 | `DEPLOY_PATH`、`DEV_DEPLOY_PATH` 等 |

若 CNB 上的仓库路径与 GitHub 包路径不一致，请在变量中设置 **`GHCR_REPO_LOWER=owner/repo`**（全小写），与 ghcr.io 上现有镜像命名一致。

### 密钥文件 `imports` 已配置但流水线仍报 `SSH_HOST` 为空

密钥仓库里的 YAML 若声明 [权限字段](https://docs.cnb.cool/zh/build/file-reference.html#权限检查)（`allow_slugs`、`allow_events`、`allow_branches`），必须与实际触发流水线的**仓库 slug、事件、分支**一致，否则该文件**不会**注入环境变量。

- **`allow_slugs`**：使用 glob。建议写成完整路径 **`lewis-test/lewis-testcase-platform`**，或 **`lewis-test/**`**；仅 **`lewis-test`** 往往**匹配不到**带 `/` 的仓库 slug，会导致整份密钥（含 `SSH_HOST`）未加载。
- **`allow_events`**：develop 自动构建依赖 **`push`**，须包含在内。
- **`allow_branches`**：开发密钥填 **`develop`**；若误填 **`main`**，则在 develop 上推送时无法读取该文件。

## 4. 与 GitHub Actions 的关系

- **当前策略**：**自动部署仅以 CNB 为准**。GitHub 上的 `Deploy to VPS` workflow **已关闭 push 触发**，仅在 Actions 里 **手动 Run workflow** 时执行（避免与 CNB 重复部署）。
- **镜像**：CNB 流水线仍构建并推送到 **GHCR**（与原先 Actions 同一坐标），VPS 仍用 `docker-compose.ghcr.yml`。若将来改为只使用腾讯云 CCR，需改推送目标与环境变量。

## 5. 服务器端脚本

远端主机执行的是仓库中的 `scripts/ci/remote-deploy-ghcr.sh`（由 rsync 同步上去）。GitHub Actions 与 CNB 共用该脚本，避免两套编排分叉。

## 6. CNB 流水线脚本（`scripts/ci/cnb-deploy-vps.sh`）

推送 `develop` / `main` 时执行：本地 **`pnpm build`** → **`docker build`** 前后端镜像并推送 → **`rsync`** 到 VPS → SSH 执行 **`remote-deploy-ghcr.sh`**（拉镜像并 `compose up`）。

**镜像仓库二选一**（在 CNB「密钥 / 变量」中配置）：

| 方式 | 必填 |
|------|------|
| **GHCR** | `GHCR_PUSH_TOKEN`、`GHCR_LOGIN_USER`、**变量** `GHCR_REPO_LOWER`（小写 `owner/repo`）；VPS 拉镜像可选 `GHCR_PULL_TOKEN` |
| **CNB 制品库** | `CNB_TOKEN`；**变量** `CNB_DOCKER_REGISTRY`：可为 **完整前缀**（`docker.cnb.cool/group/repo`），也可仅为 **`docker.cnb.cool`**（此时流水线须带有 **`CNB_REPO_SLUG_LOWERCASE`**，脚本会自动拼成 `docker.cnb.cool/group/repo`）。若只填主机名且没有 slug，会得到非法镜像名 `docker.cnb.cool/backend`，推送时出现 **400 Bad Request**。 |

其余与文档前文一致：`SSH_HOST`、`SSH_USER`、`SSH_KEY`，可选 `DEPLOY_PATH` / `DEV_DEPLOY_PATH`、`VITE_*`、`APK_MIRROR` 等。

**构建拉基础镜像超时**：大陆 Runner 访问 **AWS Public ECR** 易出现 TLS 超时；仓库内 **`frontend`/`backend` Dockerfile** 已默认使用 **Docker Hub** 的 `node` / `nginx`（可通过 build-arg `NODE_IMAGE` / `NGINX_IMAGE` 改回 Public ECR）。
