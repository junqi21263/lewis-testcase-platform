#!/bin/sh
# 在远端 VPS：stdin 传令牌执行 docker login，再 SSH 执行 pull / 重建容器（避免令牌写入远程脚本）。
# 用法：DEPLOY_FLAVOR=backend-dev sh scripts/ci/cnb-vps-remote-deploy.sh
# DEPLOY_FLAVOR: backend-dev | frontend-dev | backend-prod | frontend-prod

set -eu

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

. ./scripts/ci/cnb-require-ssh-deploy-env.sh
# 避免在 Runner 上 docker login（日志易与 VPS 登录混淆）；仅需 REGISTRY_PREFIX
CNB_SKIP_REGISTRY_LOGIN=1
export CNB_SKIP_REGISTRY_LOGIN
. ./scripts/ci/cnb-registry-env.sh

REG_HOST="${REGISTRY_PREFIX%%/*}"
REG_PULL_TOKEN="${CNB_REGISTRY_PULL_TOKEN:-${CNB_TOKEN:-}}"
if [ -z "$REG_PULL_TOKEN" ]; then
  echo "cnb-vps-remote-deploy: set CNB_REGISTRY_PULL_TOKEN or CNB_TOKEN for docker pull on VPS" >&2
  exit 1
fi

FLAVOR="${DEPLOY_FLAVOR:?DEPLOY_FLAVOR must be backend-dev|frontend-dev|backend-prod|frontend-prod}"

case "$FLAVOR" in
  backend-dev)
    CNAME="your-app-backend-dev"
    HPORT="8081"
    ISUFFIX="backend"
    ;;
  frontend-dev)
    CNAME="your-app-frontend-dev"
    HPORT="8080"
    ISUFFIX="frontend"
    ;;
  backend-prod)
    CNAME="your-app-backend-prod"
    HPORT="8081"
    ISUFFIX="backend"
    ;;
  frontend-prod)
    CNAME="your-app-frontend-prod"
    HPORT="80"
    ISUFFIX="frontend"
    ;;
  *)
    echo "cnb-vps-remote-deploy: unknown DEPLOY_FLAVOR=$FLAVOR" >&2
    exit 1
    ;;
esac

IMG="${REGISTRY_PREFIX}/${ISUFFIX}:${IMAGE_TAG}"

printf '%s\n' "${SSH_KEY}" > /tmp/ssh_key && chmod 600 /tmp/ssh_key

# -T：关闭伪终端，stdin 才能可靠传给远端 docker login（否则易出现 login 假成功 / pull 仍 unauthorized）
ssh_vps() {
  ssh -T -o StrictHostKeyChecking=no -i /tmp/ssh_key -p "${SSH_PORT}" "${SSH_USER}@${SSH_HOST}" "$@"
}

echo "cnb-vps-remote-deploy: docker login on VPS ${REG_HOST} (user cnb)..."
if ! printf '%s\n' "${REG_PULL_TOKEN}" | ssh_vps docker login "${REG_HOST}" -u cnb --password-stdin; then
  echo "cnb-vps-remote-deploy: docker login on VPS failed. Try repo variable CNB_REGISTRY_PULL_TOKEN (read-only)." >&2
  exit 1
fi

ssh_vps "
  set -e
  docker pull ${IMG} &&
  docker stop ${CNAME} || true &&
  docker rm ${CNAME} || true &&
  docker run -d --name ${CNAME} --restart=always -p ${HPORT}:80 ${IMG} &&
  docker system prune -af
"
