#!/bin/sh
# CNB / SSH 部署阶段：校验远端必备变量，避免 set -u 下出现含糊的 "parameter not set"。
# 在仓库设置中注入（名称须一致）：SSH_HOST、SSH_USER、SSH_KEY；可选 SSH_PORT（默认 22）。
# develop 部署密钥可通过 imports 引用密钥仓库中的 vps-dev-secret.yml 等方式下发。
set -eu

if [ -z "${SSH_HOST:-}" ]; then
  echo "cnb-require-ssh-deploy-env: SSH_HOST is not set. Add it under CNB repo → Settings → secrets/vars for cloud build, or fix imports (e.g. vps-dev-secret.yml)." >&2
  exit 2
fi
if [ -z "${SSH_USER:-}" ]; then
  echo "cnb-require-ssh-deploy-env: SSH_USER is not set." >&2
  exit 2
fi
if [ -z "${SSH_KEY:-}" ]; then
  echo "cnb-require-ssh-deploy-env: SSH_KEY is not set (private key for SSH deploy)." >&2
  exit 2
fi
SSH_PORT="${SSH_PORT:-22}"
export SSH_PORT
