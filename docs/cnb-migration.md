# 将仓库迁入腾讯云 CNB（cnb.cool）

本文说明如何把代码与 CI 从 GitHub 迁到 CNB，并与现有 VPS + GHCR/国内镜像仓部署衔接。

## 1. 在 CNB 创建组织与空仓库

在 [cnb.cool](https://cnb.cool) 创建根组织与目标仓库（名称可与 GitHub 不同）。

## 2. 迁入代码

任选其一：

- **官方迁移镜像**：例如使用 `cnbcool/code-import`，配置 GitHub Token、CNB Token、根组织等，将 GitHub 侧仓库批量导入（参见 CNB 文档与社区「迁移工具」文章）。
- **裸克隆推送**：

```bash
git clone --mirror git@github.com:OWNER/REPO.git
cd REPO.git
git remote add cnb git@cnb.cool:GROUP/REPO.git   # 按你在 CNB 上的 SSH 地址修改
git push cnb --mirror
```

之后在常用工作副本里增加远程：`git remote add cnb …`，日常推送到 `cnb` 的 `develop` / `main`。

## 3. 开通流水线并配置密钥/变量

仓库根目录已有 `.cnb.yml`，推送 `develop`/`main` 会执行 `scripts/ci/cnb-deploy-vps.sh`。

在 CNB 仓库设置中为流水线注入密钥与变量（名称尽量与 GitHub **Secrets / Variables** 一致，便于对照迁移）：

| 用途 | 建议名称 |
| --- | --- |
| SSH 部署 | `SSH_HOST`, `SSH_USER`, `SSH_KEY`，可选 `SSH_PORT` |
| 向 GHCR 推送镜像 | `GHCR_PUSH_TOKEN`（GitHub PAT，`write:packages`）、`GHCR_LOGIN_USER`（GitHub 用户名） |
| VPS 拉 GHCR（私有） | `GHCR_PULL_TOKEN`（可选）、远端登录用户在脚本中为 `GHCR_LOGIN_USER` |
| 国内镜像同步 | `DEPLOY_PULL_FROM_MIRROR=true` + `CONTAINER_MIRROR_*` 变量（与 GitHub 一致） |
| 路径 | `DEPLOY_PATH`、`DEV_DEPLOY_PATH` 等 |

若 CNB 上的仓库路径与 GitHub 包路径不一致，请在变量中设置 **`GHCR_REPO_LOWER=owner/repo`**（全小写），与 ghcr.io 上现有镜像命名一致。

## 4. 与 GitHub Actions 的关系

- **迁初期**：可同时保留 GitHub 推送；在 CNB 验证流水线通过后，再在 GitHub 关闭或限制 `Deploy to VPS` workflow，避免双轨部署。
- **镜像**：当前流水线仍构建并推送到 **GHCR**（与 `.github/workflows/deploy-vps.yml` 同一坐标），VPS 逻辑无需改 `docker-compose.ghcr.yml`。若将来改为只使用腾讯云 CCR，可在脚本中改为推送 CCR 并调整 `BACKEND_IMAGE`/`FRONTEND_IMAGE` 来源。

## 5. 服务器端脚本

远端主机执行的是仓库中的 `scripts/ci/remote-deploy-ghcr.sh`（由 rsync 同步上去）。GitHub Actions 与 CNB 共用该脚本，避免两套编排分叉。
