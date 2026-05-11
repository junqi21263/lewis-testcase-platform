#!/bin/sh
# CNB / SSH 部署阶段：校验远端必备变量，避免 set -u 下出现含糊的 "parameter not set"。
#
# 命名约定（二选一，可在 CNB 仓库密钥或 imports 的 YAML 中配置）：
# — 通用：SSH_HOST、SSH_USER、SSH_KEY，可选 SSH_PORT（默认 22）。
# — 开发环境（ENVIRONMENT=development）：密钥仓库常使用 DEV_SSH_HOST / DEV_SSH_USER /
#   DEV_SSH_KEY / DEV_SSH_PORT，以免与生产 SSH_* 同时注入时互相覆盖；本脚本会优先采用
#   DEV_SSH_*，再回退到 SSH_*。
#
set -eu

# 开发环境：优先 DEV_SSH_*（与 vps-dev-secret 常见命名一致），再回退到通用 SSH_*
if [ "${ENVIRONMENT:-}" = "development" ] || [ "${IMAGE_TAG:-}" = "dev" ]; then
  SSH_HOST="${DEV_SSH_HOST:-${SSH_HOST:-}}"
  SSH_USER="${DEV_SSH_USER:-${SSH_USER:-}}"
  SSH_KEY="${DEV_SSH_KEY:-${SSH_KEY:-}}"
  SSH_PORT="${DEV_SSH_PORT:-${SSH_PORT:-}}"
fi

SSH_PORT="${SSH_PORT:-22}"
export SSH_HOST SSH_USER SSH_KEY SSH_PORT

if [ -z "${SSH_HOST:-}" ]; then
  echo "cnb-require-ssh-deploy-env: SSH_HOST is empty. Set SSH_HOST or (for dev) DEV_SSH_HOST in CNB repo secrets/vars, or in imports such as vps-dev-secret.yml." >&2
  exit 2
fi
if [ -z "${SSH_USER:-}" ]; then
  echo "cnb-require-ssh-deploy-env: SSH_USER is empty. Set SSH_USER or DEV_SSH_USER." >&2
  exit 2
fi
if [ -z "${SSH_KEY:-}" ]; then
  echo "cnb-require-ssh-deploy-env: SSH_KEY is empty. Set SSH_KEY or DEV_SSH_KEY (private key PEM)." >&2
  exit 2
fi
