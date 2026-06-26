#!/bin/sh
# 在远端 VPS：stdin 传令牌执行 docker login，再 SSH 执行 pull / 重建容器（避免令牌写入远程脚本）。
# 用法：DEPLOY_FLAVOR=backend-dev sh scripts/ci/cnb-vps-remote-deploy.sh
# DEPLOY_FLAVOR: backend-dev | parse-worker-dev | frontend-dev | backend-prod | parse-worker-prod | frontend-prod

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

FLAVOR="${DEPLOY_FLAVOR:?DEPLOY_FLAVOR must be backend-dev|parse-worker-dev|frontend-dev|backend-prod|parse-worker-prod|frontend-prod}"

# 后端 Nest 监听 PORT（默认 3000），见 backend/start.sh；前端 nginx 默认 80，见 frontend/docker-entrypoint.sh
# 宿主机映射端口可被占用（Bind ... failed: port is already allocated）。可在 CNB 变量中覆盖：
# CNB_BACKEND_DEV_HOST_PORT（默认 8081）、CNB_FRONTEND_DEV_HOST_PORT（默认 8080）、
# CNB_BACKEND_PROD_HOST_PORT（默认 8081）、CNB_FRONTEND_PROD_HOST_PORT（默认 80）。
# 后端容器启动后再接入已有网络（逗号分隔）：CNB_BACKEND_EXTRA_NETWORKS
#   例：lewis_testcase_platform_testcase_network —— 使 DATABASE_URL 可用主机名 testcase_postgres（与 compose 库同网）。
case "$FLAVOR" in
  backend-dev)
    CNAME="your-app-backend-dev"
    HPORT="${CNB_BACKEND_DEV_HOST_PORT:-8081}"
    ISUFFIX="backend"
    CPORT="3000"
    ;;
  parse-worker-dev)
    CNAME="your-app-parse-worker-dev"
    HPORT=""
    ISUFFIX="backend"
    CPORT=""
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
  parse-worker-prod)
    CNAME="your-app-parse-worker-prod"
    HPORT=""
    ISUFFIX="backend"
    CPORT=""
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

# CNB docker-run 部署曾经从 docker-compose 部署迁移而来；同一台 VPS 上可能还残留
# testcase_* 容器占用相同宿主端口。只自动替换本项目已知旧容器名，其他端口占用直接失败。
case "$FLAVOR" in
  backend-dev)
    KNOWN_PORT_OWNER_NAMES="testcase_dev_backend testcase_backend_dev ${CNAME}"
    ;;
  frontend-dev)
    KNOWN_PORT_OWNER_NAMES="testcase_dev_frontend testcase_frontend_dev ${CNAME}"
    ;;
  backend-prod)
    KNOWN_PORT_OWNER_NAMES="testcase_prod_backend testcase_backend ${CNAME}"
    ;;
  frontend-prod)
    KNOWN_PORT_OWNER_NAMES="testcase_prod_frontend testcase_frontend ${CNAME}"
    ;;
  *)
    KNOWN_PORT_OWNER_NAMES="${CNAME}"
    ;;
esac
REPLACE_KNOWN_PORT_OWNER="${CNB_REPLACE_KNOWN_PORT_OWNER:-1}"

# 前端 nginx 将 /api、/health 反代到主机名 backend:3000（见 frontend/nginx.conf.template）。
# 独立 docker run 时默认 bridge 无 DNS，必须让前后端加入同一 user-defined 网络，并为后端设置别名 backend。
case "$FLAVOR" in
  backend-dev|parse-worker-dev|frontend-dev)
    NETWORK="${CNB_APP_DOCKER_NETWORK_DEV:-cnb-app-dev}"
    ;;
  backend-prod|parse-worker-prod|frontend-prod)
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
  backend-dev|parse-worker-dev|backend-prod|parse-worker-prod)
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
if [ -z "${HPORT}" ]; then
  echo "cnb-vps-remote-deploy: no host port published for ${FLAVOR}"
fi
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
# 勿使用 docker system prune -af：会删除「已退出」的容器；若后端因缺 DATABASE_URL 等瞬间退出，
# 紧接着 prune 会清掉后端容器，下一阶段前端将无法解析 upstream backend。
RUN_BACKEND_NET=""
RUN_WORKER_NET=""
RUN_FRONTEND_NET=""
case "$FLAVOR" in
  backend-dev|backend-prod)
    RUN_BACKEND_NET="--network ${NETWORK} --network-alias backend"
    ;;
  parse-worker-dev|parse-worker-prod)
    RUN_WORKER_NET="--network ${NETWORK}"
    ;;
  frontend-dev|frontend-prod)
    RUN_FRONTEND_NET="--network ${NETWORK}"
    ;;
esac

RUN_ENV_ARGS=""
RUN_PORT_ARGS=""
case "$FLAVOR" in
  backend-dev|backend-prod)
    RUN_ENV_ARGS="-e FILE_PARSE_WORKER_ENABLED=0"
    RUN_PORT_ARGS="-p ${HPORT}:${CPORT}"
    ;;
  parse-worker-dev|parse-worker-prod)
    RUN_ENV_ARGS="-e FILE_PARSE_WORKER_ENABLED=1"
    ;;
  frontend-dev|frontend-prod)
    RUN_PORT_ARGS="-p ${HPORT}:${CPORT}"
    ;;
esac

# 后端/解析 worker 额外接入已有 Docker 网络；开发/生产可在密钥中分别配置。
CONNECT_EXTRA=""
case "$FLAVOR" in
  backend-dev|parse-worker-dev|backend-prod|parse-worker-prod)
    CONNECT_EXTRA="${CNB_BACKEND_EXTRA_NETWORKS:-}"
    ;;
esac

ssh_vps "
  set -eu
  docker network inspect ${NETWORK} >/dev/null 2>&1 || docker network create ${NETWORK}
  docker pull ${IMG}

  docker stop ${CNAME} >/dev/null 2>&1 || true
  docker rm ${CNAME} >/dev/null 2>&1 || true

  if [ -n '${HPORT}' ]; then
    PORT_OWNER=\$(docker ps --filter publish=${HPORT} --format '{{.ID}} {{.Names}}' | head -n 1 || true)
    if [ -n \"\${PORT_OWNER}\" ]; then
      OWNER_ID=\$(printf '%s\n' \"\${PORT_OWNER}\" | awk '{print \$1}')
      OWNER_NAME=\$(printf '%s\n' \"\${PORT_OWNER}\" | awk '{print \$2}')
      MATCHED=0
      for known in ${KNOWN_PORT_OWNER_NAMES}; do
        if [ \"\${OWNER_NAME}\" = \"\${known}\" ]; then
          MATCHED=1
          break
        fi
      done

      if [ \"\${MATCHED}\" = '1' ] && [ '${REPLACE_KNOWN_PORT_OWNER}' = '1' ]; then
        echo \"cnb-vps-remote-deploy: replacing known port owner \${OWNER_NAME} on ${HPORT}\"
        docker stop \"\${OWNER_ID}\" >/dev/null 2>&1 || true
        docker rm \"\${OWNER_ID}\" >/dev/null 2>&1 || true
      else
        echo \"cnb-vps-remote-deploy: ERROR: host port ${HPORT} is already used by \${OWNER_NAME} (\${OWNER_ID}).\" >&2
        echo \"  Set a different CNB_*_HOST_PORT or stop the owner container on VPS.\" >&2
        exit 1
      fi
    fi
  fi

  docker run -d --name ${CNAME} --restart=always ${RUN_BACKEND_NET} ${RUN_WORKER_NET} ${RUN_FRONTEND_NET} ${BACKEND_ENV_ARGS} ${RUN_ENV_ARGS} ${RUN_PORT_ARGS} ${IMG}
  docker image prune -f >/dev/null 2>&1 || true
"

if [ -n "${CONNECT_EXTRA}" ]; then
  echo "cnb-vps-remote-deploy: attaching ${CNAME} to extra network(s): ${CONNECT_EXTRA}"
  OLD_IFS=${IFS}
  IFS=','
  for __net in ${CONNECT_EXTRA}; do
    IFS=${OLD_IFS}
    __trim=$(printf '%s\n' "${__net}" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
    [ -z "${__trim}" ] && continue
    ssh_vps "docker network connect ${__trim} ${CNAME} || true"
  done
  IFS=${OLD_IFS}
fi
