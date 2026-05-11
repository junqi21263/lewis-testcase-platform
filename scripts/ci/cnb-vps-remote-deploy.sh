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
REG_USER="${CNB_REGISTRY_LOGIN_USER:-cnb}"
# 优先专用拉取令牌；流水线内置 CNB_TOKEN 常在「非 Runner 环境」下无法完成 docker login（VPS 上 unauthorized）
REG_PULL_TOKEN_EXPLICIT="${CNB_REGISTRY_PULL_TOKEN:-}"
REG_PULL_TOKEN="${REG_PULL_TOKEN_EXPLICIT:-${CNB_TOKEN:-}}"
if [ -z "$REG_PULL_TOKEN" ]; then
  echo "cnb-vps-remote-deploy: set CNB_REGISTRY_PULL_TOKEN (recommended) or CNB_TOKEN" >&2
  exit 1
fi

FLAVOR="${DEPLOY_FLAVOR:?DEPLOY_FLAVOR must be backend-dev|frontend-dev|backend-prod|frontend-prod}"

# 后端 Nest 监听 PORT（默认 3000），见 backend/start.sh；前端 nginx 默认 80，见 frontend/docker-entrypoint.sh
# 宿主机映射端口可被占用（Bind ... failed: port is already allocated）。可在 CNB 变量中覆盖：
# CNB_BACKEND_DEV_HOST_PORT（默认 8081）、CNB_FRONTEND_DEV_HOST_PORT（默认 8080）、
# CNB_BACKEND_PROD_HOST_PORT（默认 8081）、CNB_FRONTEND_PROD_HOST_PORT（默认 80）。
case "$FLAVOR" in
  backend-dev)
    CNAME="your-app-backend-dev"
    HPORT="${CNB_BACKEND_DEV_HOST_PORT:-8081}"
    ISUFFIX="backend"
    CPORT="3000"
    ;;
  frontend-dev)
    CNAME="your-app-frontend-dev"
    HPORT="${CNB_FRONTEND_DEV_HOST_PORT:-8080}"
    ISUFFIX="frontend"
    CPORT="80"
    ;;
  backend-prod)
    CNAME="your-app-backend-prod"
    HPORT="${CNB_BACKEND_PROD_HOST_PORT:-8081}"
    ISUFFIX="backend"
    CPORT="3000"
    ;;
  frontend-prod)
    CNAME="your-app-frontend-prod"
    HPORT="${CNB_FRONTEND_PROD_HOST_PORT:-80}"
    ISUFFIX="frontend"
    CPORT="80"
    ;;
  *)
    echo "cnb-vps-remote-deploy: unknown DEPLOY_FLAVOR=$FLAVOR" >&2
    exit 1
    ;;
esac

# 前端 nginx 将 /api、/health 反代到主机名 backend:3000（见 frontend/nginx.conf.template）。
# 独立 docker run 时默认 bridge 无 DNS，必须让前后端加入同一 user-defined 网络，并为后端设置别名 backend。
case "$FLAVOR" in
  backend-dev|frontend-dev)
    NETWORK="${CNB_APP_DOCKER_NETWORK_DEV:-cnb-app-dev}"
    ;;
  backend-prod|frontend-prod)
    NETWORK="${CNB_APP_DOCKER_NETWORK_PROD:-cnb-app-prod}"
    ;;
  *)
    NETWORK="cnb-app-dev"
    ;;
esac

IMG="${REGISTRY_PREFIX}/${ISUFFIX}:${IMAGE_TAG}"

: "${IMAGE_TAG:?IMAGE_TAG must be set (from pipeline env)}"

# 后端启动需要 DATABASE_URL 等（见 backend/start.sh）。在 VPS 上准备 env 文件后，在 CNB 变量中设置
# DEPLOY_BACKEND_ENV_FILE=/绝对路径/backend.env，此处会把 --env-file 传给 docker run。
BACKEND_ENV_ARGS=""
case "$FLAVOR" in
  backend-dev|backend-prod)
    if [ -n "${DEPLOY_BACKEND_ENV_FILE:-}" ]; then
      BACKEND_ENV_ARGS="--env-file ${DEPLOY_BACKEND_ENV_FILE}"
    else
      echo "cnb-vps-remote-deploy: WARN: DEPLOY_BACKEND_ENV_FILE unset — backend needs DATABASE_URL etc. (backend/start.sh). Set CNB variable to env file path on VPS or container will exit." >&2
    fi
    ;;
esac

printf '%s\n' "${SSH_KEY}" > /tmp/ssh_key && chmod 600 /tmp/ssh_key

# -T：关闭伪终端，stdin 才能可靠传给远端 docker login（否则易出现 login 假成功 / pull 仍 unauthorized）
ssh_vps() {
  ssh -T -o StrictHostKeyChecking=no -i /tmp/ssh_key -p "${SSH_PORT}" "${SSH_USER}@${SSH_HOST}" "$@"
}

echo "cnb-vps-remote-deploy: mapping host ${HPORT} -> container ${CPORT} for ${FLAVOR}"
echo "cnb-vps-remote-deploy: docker login on VPS ${REG_HOST} (user ${REG_USER})..."
if ! printf '%s\n' "${REG_PULL_TOKEN}" | ssh_vps docker login "${REG_HOST}" -u "${REG_USER}" --password-stdin; then
  echo "cnb-vps-remote-deploy: docker login on VPS failed (unauthorized on /v2/)." >&2
  echo "  1) 在 CNB 创建访问令牌 https://cnb.cool/profile/token （勾选制品库读权限），仓库变量名：CNB_REGISTRY_PULL_TOKEN。" >&2
  echo "  2) 流水线内置 CNB_TOKEN 在 VPS 上常无法拉私有镜像；见 https://docs.cnb.cool/zh/artifact/docker.html" >&2
  if [ -z "$REG_PULL_TOKEN_EXPLICIT" ]; then
    echo "  3) 当前回退使用了 CNB_TOKEN 而非 CNB_REGISTRY_PULL_TOKEN，若仍失败请显式配置后者。" >&2
  fi
  exit 1
fi

# 后端：--network-alias backend；前端：仅加入同一网络，以便 nginx 能解析 backend。
RUN_BACKEND_NET=""
RUN_FRONTEND_NET=""
case "$FLAVOR" in
  backend-dev|backend-prod)
    RUN_BACKEND_NET="--network ${NETWORK} --network-alias backend"
    ;;
  frontend-dev|frontend-prod)
    RUN_FRONTEND_NET="--network ${NETWORK}"
    ;;
esac

ssh_vps "
  set -e
  docker network inspect ${NETWORK} >/dev/null 2>&1 || docker network create ${NETWORK}
  docker pull ${IMG} &&
  docker stop ${CNAME} || true &&
  docker rm ${CNAME} || true &&
  docker run -d --name ${CNAME} --restart=always ${RUN_BACKEND_NET} ${RUN_FRONTEND_NET} ${BACKEND_ENV_ARGS} -p ${HPORT}:${CPORT} ${IMG} &&
  docker system prune -af
"
