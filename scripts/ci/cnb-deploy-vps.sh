#!/usr/bin/env bash
# CNB 流水线调用：构建前端 + 构建并推送 GHCR 镜像、可选同步国内仓、rsync、SSH 触发 VPS 部署。
# 依赖 CNB 内置变量：CNB_BRANCH、CNB_COMMIT、CNB_GROUP_SLUG_LOWERCASE、CNB_REPO_NAME_LOWERCASE 等。
# 需在 CNB 仓库配置密钥/变量，见仓库根目录 .cnb.yml 顶部注释。
set -euo pipefail

install_runner_deps() {
  if command -v apt-get >/dev/null 2>&1; then
    export DEBIAN_FRONTEND=noninteractive
    if command -v sudo >/dev/null 2>&1; then
      sudo apt-get update -qq
      sudo apt-get install -y -qq rsync openssh-client ca-certificates curl git >/dev/null
    else
      apt-get update -qq
      apt-get install -y -qq rsync openssh-client ca-certificates curl git >/dev/null
    fi
  fi
}

install_runner_deps
corepack enable
corepack prepare pnpm@10 --activate

case "${CNB_BRANCH:-}" in
  develop)
    DEPLOY_ENV=development
    DEPLOY_TARGET="${DEV_DEPLOY_PATH:-/opt/lewis_testcase_platform_dev}"
    ENV_FILE=".env.development"
    IMAGE_TAG=develop
    INSTALL_CJK_FONTS=0
    ;;
  main)
    DEPLOY_ENV=production
    DEPLOY_TARGET="${DEPLOY_PATH:-/opt/lewis_testcase_platform}"
    ENV_FILE=".env"
    IMAGE_TAG=main
    INSTALL_CJK_FONTS=1
    ;;
  *)
    echo "Skip deploy: branch '${CNB_BRANCH:-}' is not develop or main."
    exit 0
    ;;
esac

SHA="${CNB_COMMIT:?}"
GHCR_REPO_LOWER="${GHCR_REPO_LOWER:-${CNB_GROUP_SLUG_LOWERCASE:?}/${CNB_REPO_NAME_LOWERCASE:?}}"
CNB_IMAGE_PREFIX=""
REGISTRY_MODE=""
if [ -n "${GHCR_PUSH_TOKEN:-}" ] && [ -n "${GHCR_LOGIN_USER:-}" ]; then
  REGISTRY_MODE="ghcr"
  IMAGE_TAG_PREFIX="ghcr.io/${GHCR_REPO_LOWER}"
elif [ -n "${CNB_DOCKER_REGISTRY:-}" ] && [ -n "${CNB_TOKEN:-}" ] && [ -n "${CNB_REPO_SLUG_LOWERCASE:-}" ]; then
  REGISTRY_MODE="cnb"
  # 非同名制品：仓库路径 + 镜像名，见 https://docs.cnb.cool/zh/artifact/docker.html
  IMAGE_TAG_PREFIX="${CNB_DOCKER_REGISTRY}/${CNB_REPO_SLUG_LOWERCASE}"
else
  echo "::error::Either set GHCR_PUSH_TOKEN + GHCR_LOGIN_USER (GitHub PAT), or run on CNB Cloud Build (CNB_TOKEN + CNB_DOCKER_REGISTRY + CNB_REPO_SLUG_LOWERCASE are injected)."
  exit 1
fi

T0="$(date +%s)"
echo "📌 deploy profile: env=$DEPLOY_ENV path=$DEPLOY_TARGET sha=$SHA registry_mode=$REGISTRY_MODE image_prefix=$IMAGE_TAG_PREFIX"

export VITE_API_BASE_URL="${VITE_API_BASE_URL:-/api}"
export VITE_APP_NAME="${VITE_APP_NAME:-}"

(
  cd frontend
  pnpm install --frozen-lockfile
  pnpm run build
)
echo "📌 vite build done (+$(( $(date +%s) - T0 ))s)"

if [ "$REGISTRY_MODE" = "ghcr" ]; then
  echo "$GHCR_PUSH_TOKEN" | docker login ghcr.io -u "$GHCR_LOGIN_USER" --password-stdin
else
  echo "$CNB_TOKEN" | docker login "$CNB_DOCKER_REGISTRY" -u "${CNB_TOKEN_USER_NAME:-cnb}" --password-stdin
fi

docker buildx version >/dev/null 2>&1 || true
docker buildx create --use --driver docker-container 2>/dev/null || docker buildx create --use 2>/dev/null || true

docker buildx build \
  --push \
  --platform linux/amd64 \
  --file backend/Dockerfile \
  --tag "${IMAGE_TAG_PREFIX}/backend:${SHA}" \
  --tag "${IMAGE_TAG_PREFIX}/backend:${IMAGE_TAG}" \
  --build-arg "INSTALL_CJK_FONTS=${INSTALL_CJK_FONTS}" \
  --build-arg "APK_MIRROR=${APK_MIRROR:-}" \
  .

echo "📌 backend image pushed (+$(( $(date +%s) - T0 ))s)"

(
  cd frontend
  docker buildx build \
    --push \
    --platform linux/amd64 \
    --file Dockerfile \
    --tag "${IMAGE_TAG_PREFIX}/frontend:${SHA}" \
    --tag "${IMAGE_TAG_PREFIX}/frontend:${IMAGE_TAG}" \
    --build-arg "VITE_API_BASE_URL=${VITE_API_BASE_URL}" \
    --build-arg "VITE_APP_NAME=${VITE_APP_NAME}" \
    --build-arg "APK_MIRROR=${APK_MIRROR:-}" \
    .
)

echo "📌 frontend image pushed (+$(( $(date +%s) - T0 ))s)"

if [ "${DEPLOY_PULL_FROM_MIRROR:-false}" = "true" ]; then
  if [ -z "${CONTAINER_MIRROR_IMAGE_PREFIX:-}" ] || [ -z "${CONTAINER_MIRROR_REGISTRY:-}" ] \
    || [ -z "${CONTAINER_MIRROR_USERNAME:-}" ] || [ -z "${CONTAINER_MIRROR_PASSWORD:-}" ]; then
    echo "::error::DEPLOY_PULL_FROM_MIRROR=true requires CONTAINER_MIRROR_* (prefix + registry + username + password)."
    exit 1
  fi
  echo "$CONTAINER_MIRROR_PASSWORD" | docker login "$CONTAINER_MIRROR_REGISTRY" -u "$CONTAINER_MIRROR_USERNAME" --password-stdin
  SOURCE_PREFIX="$IMAGE_TAG_PREFIX"
  MIRROR_PREFIX="${CONTAINER_MIRROR_IMAGE_PREFIX}"
  TM="${MIRROR_STEP_TIMEOUT_MIN:-90}"
  echo "📌 mirroring to domestic registry (timeout ${TM}m)..."
  # shellcheck disable=SC2016
  timeout "${TM}m" env SOURCE_PREFIX="$SOURCE_PREFIX" MIRROR_PREFIX="$MIRROR_PREFIX" SHA="$SHA" bash -eo pipefail -c '
    mirror_one() {
      local svc=$1
      echo "Mirroring ${svc}..."
      docker pull "${SOURCE_PREFIX}/${svc}:${SHA}"
      docker tag "${SOURCE_PREFIX}/${svc}:${SHA}" "${MIRROR_PREFIX}/${svc}:${SHA}"
      docker push "${MIRROR_PREFIX}/${svc}:${SHA}"
    }
    fail=0
    mirror_one backend & pid_be=$!
    mirror_one frontend & pid_fe=$!
    wait "$pid_be" || fail=1
    wait "$pid_fe" || fail=1
    exit "$fail"
  '
  rc=$?
  if [ "$rc" -eq 124 ]; then
    echo "::error::Mirror sync exceeded ${TM} minutes."
    exit 124
  fi
  if [ "$rc" -ne 0 ]; then
    exit "$rc"
  fi
  echo "📌 mirror done (+$(( $(date +%s) - T0 ))s)"
fi

: "${SSH_HOST:?}"
: "${SSH_USER:?}"
: "${SSH_KEY:?}"
SSH_PORT="${SSH_PORT:-22}"

mkdir -p ~/.ssh
chmod 700 ~/.ssh
ssh-keyscan -p "$SSH_PORT" "$SSH_HOST" >> ~/.ssh/known_hosts 2>/dev/null || true

echo "$SSH_KEY" > /tmp/cnb_deploy_key
chmod 600 /tmp/cnb_deploy_key

ssh -i /tmp/cnb_deploy_key -p "$SSH_PORT" -o StrictHostKeyChecking=yes "$SSH_USER@$SSH_HOST" "sudo mkdir -p \"$DEPLOY_TARGET\""
rsync -az --delete \
  -e "ssh -i /tmp/cnb_deploy_key -p $SSH_PORT -o StrictHostKeyChecking=yes" \
  --rsync-path="sudo rsync" \
  --exclude ".git/" \
  --exclude ".env" \
  --exclude ".env.*" \
  --exclude "backend/.env" \
  --exclude "frontend/.env" \
  --exclude "node_modules/" \
  --exclude "frontend/node_modules/" \
  --exclude "backend/node_modules/" \
  --exclude "backend/uploads/" \
  --exclude "frontend/dist/" \
  --exclude "backend/dist/" \
  ./ "$SSH_USER@$SSH_HOST:$DEPLOY_TARGET/"

echo "📌 rsync done (+$(( $(date +%s) - T0 ))s)"

rm -f /tmp/cnb_deploy_key

# VPS 拉 CNB 制品库：优先密钥 CNB_REGISTRY_PULL_TOKEN；未配置则用当次流水线的 CNB_TOKEN（与 GHCR_PULL_TOKEN 用法类似）
PRESET_BACKEND_IMAGE=""
PRESET_FRONTEND_IMAGE=""
PRESET_REGISTRY_LOGIN_URL=""
PRESET_REGISTRY_LOGIN_USER=""
PRESET_REGISTRY_LOGIN_PASSWORD=""
if [ "$REGISTRY_MODE" = "cnb" ] && [ "${DEPLOY_PULL_FROM_MIRROR:-false}" != "true" ]; then
  PRESET_BACKEND_IMAGE="${IMAGE_TAG_PREFIX}/backend:${SHA}"
  PRESET_FRONTEND_IMAGE="${IMAGE_TAG_PREFIX}/frontend:${SHA}"
  PRESET_REGISTRY_LOGIN_URL="${CNB_DOCKER_REGISTRY}"
  PRESET_REGISTRY_LOGIN_USER="cnb"
  PRESET_REGISTRY_LOGIN_PASSWORD="${CNB_REGISTRY_PULL_TOKEN:-$CNB_TOKEN}"
fi

# 远程：通过 printf %q 传递可能含特殊字符的密钥
exec_ssh_remote() {
  ssh -i /tmp/cnb_deploy_key -p "$SSH_PORT" -o StrictHostKeyChecking=yes "$SSH_USER@$SSH_HOST" bash -s <<REMOTE_EOF
set -euo pipefail
export DEPLOY_ENV=$(printf '%q' "$DEPLOY_ENV")
export DEPLOY_PATH=$(printf '%q' "$DEPLOY_TARGET")
export ENV_FILE=$(printf '%q' "$ENV_FILE")
export DEPLOY_SHA=$(printf '%q' "$SHA")
export GHCR_REPO_LOWER=$(printf '%q' "$GHCR_REPO_LOWER")
export DEPLOY_REGION=$(printf '%q' "${DEPLOY_REGION:-}")
export DEPLOY_PULL_FROM_MIRROR=$(printf '%q' "${DEPLOY_PULL_FROM_MIRROR:-false}")
export CONTAINER_MIRROR_IMAGE_PREFIX=$(printf '%q' "${CONTAINER_MIRROR_IMAGE_PREFIX:-}")
export CONTAINER_MIRROR_REGISTRY=$(printf '%q' "${CONTAINER_MIRROR_REGISTRY:-}")
export CONTAINER_MIRROR_USERNAME=$(printf '%q' "${CONTAINER_MIRROR_USERNAME:-}")
export CONTAINER_MIRROR_PASSWORD=$(printf '%q' "${CONTAINER_MIRROR_PASSWORD:-}")
export GHCR_PULL_TOKEN=$(printf '%q' "${GHCR_PULL_TOKEN:-}")
export GHCR_LOGIN_USER=$(printf '%q' "${GHCR_LOGIN_USER:-}")
export APK_MIRROR=$(printf '%q' "${APK_MIRROR:-}")
export DEPLOY_SMOKE_PUBLIC_HOST=$(printf '%q' "${SSH_HOST}")
export PRESET_BACKEND_IMAGE=$(printf '%q' "${PRESET_BACKEND_IMAGE:-}")
export PRESET_FRONTEND_IMAGE=$(printf '%q' "${PRESET_FRONTEND_IMAGE:-}")
export PRESET_REGISTRY_LOGIN_URL=$(printf '%q' "${PRESET_REGISTRY_LOGIN_URL:-}")
export PRESET_REGISTRY_LOGIN_USER=$(printf '%q' "${PRESET_REGISTRY_LOGIN_USER:-}")
export PRESET_REGISTRY_LOGIN_PASSWORD=$(printf '%q' "${PRESET_REGISTRY_LOGIN_PASSWORD:-}")
bash "\$DEPLOY_PATH/scripts/ci/remote-deploy-ghcr.sh"
REMOTE_EOF
}

echo "$SSH_KEY" > /tmp/cnb_deploy_key
chmod 600 /tmp/cnb_deploy_key
exec_ssh_remote
rm -f /tmp/cnb_deploy_key

echo "✅ CNB deploy pipeline finished (+$(( $(date +%s) - T0 ))s total)"
