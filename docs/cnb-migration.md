# 将仓库迁入腾讯云 CNB（cnb.cool）

本文说明如何把代码与 CI 从 GitHub 迁到 CNB，并与现有 VPS + GHCR/国内镜像仓部署衔接。

## 1. 在 CNB 创建组织与空仓库

在 [cnb.cool](https://cnb.cool) 创建根组织与目标仓库（名称可与 GitHub 不同）。

## 2. 迁入代码

**重要：** CNB **不提供 SSH 克隆/推送**（官方说明见 [Git 地址与认证](https://docs.cnb.cool/zh/guide/git-access.html)）。远程须用 **HTTPS**，用户名固定 **`cnb`**，密码为你在 CNB 创建的**访问令牌**（个人设置里生成；与仓库「部署令牌」用途不同，但同属令牌体系）。

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
| SSH 部署 | `SSH_HOST`, `SSH_USER`, `SSH_KEY`，可选 `SSH_PORT` |
| 向 GHCR 推送镜像 | `GHCR_PUSH_TOKEN`（GitHub PAT，`write:packages`）、`GHCR_LOGIN_USER`（GitHub 用户名） |
| VPS 拉 GHCR（私有） | `GHCR_PULL_TOKEN`（可选）、远端登录用户在脚本中为 `GHCR_LOGIN_USER` |
| 国内镜像同步 | `DEPLOY_PULL_FROM_MIRROR=true` + `CONTAINER_MIRROR_*` 变量（与 GitHub 一致） |
| 路径 | `DEPLOY_PATH`、`DEV_DEPLOY_PATH` 等 |

若 CNB 上的仓库路径与 GitHub 包路径不一致，请在变量中设置 **`GHCR_REPO_LOWER=owner/repo`**（全小写），与 ghcr.io 上现有镜像命名一致。

## 4. 与 GitHub Actions 的关系

- **当前策略**：**自动部署仅以 CNB 为准**。GitHub 上的 `Deploy to VPS` workflow **已关闭 push 触发**，仅在 Actions 里 **手动 Run workflow** 时执行（避免与 CNB 重复部署）。
- **镜像**：CNB 流水线仍构建并推送到 **GHCR**（与原先 Actions 同一坐标），VPS 仍用 `docker-compose.ghcr.yml`。若将来改为只使用腾讯云 CCR，需改推送目标与环境变量。

## 5. 服务器端脚本

远端主机执行的是仓库中的 `scripts/ci/remote-deploy-ghcr.sh`（由 rsync 同步上去）。GitHub Actions 与 CNB 共用该脚本，避免两套编排分叉。
