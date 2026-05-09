#!/usr/bin/env bash
# 腾讯云 CNB（cnb.cool）→ 构建前端与镜像 → 推送仓库 → rsync → VPS 执行 remote-deploy-ghcr.sh
# 依赖：流水线挂载 Docker；密钥 SSH_HOST / SSH_USER / SSH_KEY；镜像二选一：
#   A) GHCR：GHCR_PUSH_TOKEN + GHCR_LOGIN_USER + GHCR_REPO_LOWER（小写 owner/repo）
#   B) CNB 制品库：CNB_TOKEN + CNB_DOCKER_REGISTRY（完整镜像前缀，如 docker.cnb.cool/group/repo）
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "::error::missing command: $1"
    exit 1
  }
}

if [[ "${SKIP_APT:-}" != "1" ]] && command -v apt-get >/dev/null 2>&1; then
  apt-get update -qq && apt-get install -y -qq rsync openssh-client >/dev/null || true
fi

need_cmd docker
need_cmd git
need_cmd rsync

BRANCH="$(git rev-parse --abbrev-ref HEAD)"
SHA="$(git rev-parse HEAD)"

if [[ "$BRANCH" == "develop" ]]; then
  export DEPLOY_ENV=development
  DEPLOY_PATH="${DEV_DEPLOY_PATH:-/opt/lewis_testcase_platform_dev}"
  ENV_FILE=".env.development"
  IMAGE_TAG="develop"
  INSTALL_CJK_FONTS="0"
else
  export DEPLOY_ENV=production
  DEPLOY_PATH="${DEPLOY_PATH:-/opt/lewis_testcase_platform}"
  ENV_FILE=".env"
  IMAGE_TAG="main"
  INSTALL_CJK_FONTS="1"
fi

export VITE_API_BASE_URL="${VITE_API_BASE_URL:-/api}"
export VITE_APP_NAME="${VITE_APP_NAME:-}"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "cnb-deploy-vps: branch=$BRANCH sha=$SHA env=$DEPLOY_ENV path=$DEPLOY_PATH"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

echo "📦 Installing frontend deps & vite build..."
corepack enable >/dev/null 2>&1 || true
corepack prepare pnpm@10.33.0 --activate
cd frontend
pnpm install --frozen-lockfile
pnpm run build
cd "$ROOT"

push_ghcr() {
  : "${GHCR_REPO_LOWER:?Set secret GHCR_REPO_LOWER e.g. lewis-test/lewis-testcase-platform}"
  : "${GHCR_PUSH_TOKEN:?Set secret GHCR_PUSH_TOKEN}"
  : "${GHCR_LOGIN_USER:?Set secret GHCR_LOGIN_USER}"
  export GHCR_REPO_LOWER
  echo "$GHCR_PUSH_TOKEN" | docker login ghcr.io -u "$GHCR_LOGIN_USER" --password-stdin
  BE_BASE="ghcr.io/${GHCR_REPO_LOWER}/backend"
  FE_BASE="ghcr.io/${GHCR_REPO_LOWER}/frontend"

  docker build \
    --platform linux/amd64 \
    -f backend/Dockerfile \
    --build-arg "INSTALL_CJK_FONTS=${INSTALL_CJK_FONTS}" \
    --build-arg "APK_MIRROR=${APK_MIRROR:-}" \
    -t "${BE_BASE}:${SHA}" \
    -t "${BE_BASE}:${IMAGE_TAG}" \
    .

  docker build \
    --platform linux/amd64 \
    -f frontend/Dockerfile \
    --build-arg "VITE_API_BASE_URL=${VITE_API_BASE_URL}" \
    --build-arg "VITE_APP_NAME=${VITE_APP_NAME}" \
    --build-arg "APK_MIRROR=${APK_MIRROR:-}" \
    -t "${FE_BASE}:${SHA}" \
    -t "${FE_BASE}:${IMAGE_TAG}" \
    ./frontend

  docker push "${BE_BASE}:${SHA}"
  docker push "${BE_BASE}:${IMAGE_TAG}"
  docker push "${FE_BASE}:${SHA}"
  docker push "${FE_BASE}:${IMAGE_TAG}"
}

push_cnb_registry() {
  : "${CNB_TOKEN:?Set secret CNB_TOKEN for docker.cnb.cool}"
  : "${CNB_DOCKER_REGISTRY:?Set variable CNB_DOCKER_REGISTRY to image prefix e.g. docker.cnb.cool/group/repo}"
  REG_HOST="${CNB_DOCKER_REGISTRY%%/*}"
  echo "$CNB_TOKEN" | docker login "$REG_HOST" -u cnb --password-stdin

  BE_BASE="${CNB_DOCKER_REGISTRY}/backend"
  FE_BASE="${CNB_DOCKER_REGISTRY}/frontend"

  docker build \
    --platform linux/amd64 \
    -f backend/Dockerfile \
    --build-arg "INSTALL_CJK_FONTS=${INSTALL_CJK_FONTS}" \
    --build-arg "APK_MIRROR=${APK_MIRROR:-}" \
    -t "${BE_BASE}:${SHA}" \
    -t "${BE_BASE}:${IMAGE_TAG}" \
    .

  docker build \
    --platform linux/amd64 \
    -f frontend/Dockerfile \
    --build-arg "VITE_API_BASE_URL=${VITE_API_BASE_URL}" \
    --build-arg "VITE_APP_NAME=${VITE_APP_NAME}" \
    --build-arg "APK_MIRROR=${APK_MIRROR:-}" \
    -t "${FE_BASE}:${SHA}" \
    -t "${FE_BASE}:${IMAGE_TAG}" \
    ./frontend

  docker push "${BE_BASE}:${SHA}"
  docker push "${BE_BASE}:${IMAGE_TAG}"
  docker push "${FE_BASE}:${SHA}"
  docker push "${FE_BASE}:${IMAGE_TAG}"

  export PRESET_BACKEND_IMAGE="${BE_BASE}:${SHA}"
  export PRESET_FRONTEND_IMAGE="${FE_BASE}:${SHA}"
  export PRESET_REGISTRY_LOGIN_URL="$REG_HOST"
  export PRESET_REGISTRY_LOGIN_USER="${PRESET_REGISTRY_LOGIN_USER:-cnb}"
  export PRESET_REGISTRY_LOGIN_PASSWORD="${CNB_REGISTRY_PULL_TOKEN:-$CNB_TOKEN}"
}

if [[ -n "${GHCR_PUSH_TOKEN:-}" ]]; then
  echo "🔐 Registry mode: GHCR"
  push_ghcr
elif [[ -n "${CNB_DOCKER_REGISTRY:-}" ]]; then
  echo "🔐 Registry mode: CNB docker.cnb.cool (PRESET_* on VPS)"
  push_cnb_registry
else
  echo "::error::Configure either GHCR_PUSH_TOKEN+GHCR_LOGIN_USER+GHCR_REPO_LOWER or CNB_DOCKER_REGISTRY+CNB_TOKEN"
  exit 1
fi

: "${SSH_HOST:?Set secret SSH_HOST}"
: "${SSH_USER:?Set secret SSH_USER}"
: "${SSH_KEY:?Set secret SSH_KEY}"
SSH_PORT="${SSH_PORT:-22}"

KEY_FILE="$(mktemp)"
chmod 600 "$KEY_FILE"
printf '%s\n' "$SSH_KEY" >"$KEY_FILE"

cleanup_key() { rm -f "$KEY_FILE"; }
trap cleanup_key EXIT

ssh_base=(ssh -i "$KEY_FILE" -p "$SSH_PORT" -o StrictHostKeyChecking=accept-new)

echo "📂 rsync → ${SSH_USER}@${SSH_HOST}:${DEPLOY_PATH}"
"${ssh_base[@]}" "$SSH_USER@$SSH_HOST" "sudo mkdir -p \"$DEPLOY_PATH\""
rsync -az --delete \
  -e "ssh -i $KEY_FILE -p $SSH_PORT -o StrictHostKeyChecking=accept-new" \
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
  ./ "$SSH_USER@$SSH_HOST:$DEPLOY_PATH/"

REMOTE_EXPORTS=(
  "export DEPLOY_ENV=$(printf '%q' "$DEPLOY_ENV")"
  "export DEPLOY_PATH=$(printf '%q' "$DEPLOY_PATH")"
  "export ENV_FILE=$(printf '%q' "$ENV_FILE")"
  "export DEPLOY_SHA=$(printf '%q' "$SHA")"
)

if [[ -n "${PRESET_BACKEND_IMAGE:-}" ]]; then
  REMOTE_EXPORTS+=("export PRESET_BACKEND_IMAGE=$(printf '%q' "$PRESET_BACKEND_IMAGE")")
  REMOTE_EXPORTS+=("export PRESET_FRONTEND_IMAGE=$(printf '%q' "$PRESET_FRONTEND_IMAGE")")
  REMOTE_EXPORTS+=("export PRESET_REGISTRY_LOGIN_URL=$(printf '%q' "$PRESET_REGISTRY_LOGIN_URL")")
  REMOTE_EXPORTS+=("export PRESET_REGISTRY_LOGIN_USER=$(printf '%q' "${PRESET_REGISTRY_LOGIN_USER:-cnb}")")
  REMOTE_EXPORTS+=("export PRESET_REGISTRY_LOGIN_PASSWORD=$(printf '%q' "$PRESET_REGISTRY_LOGIN_PASSWORD")")
else
  REMOTE_EXPORTS+=("export GHCR_REPO_LOWER=$(printf '%q' "$GHCR_REPO_LOWER")")
fi

REMOTE_EXPORTS+=("export DEPLOY_REGION=$(printf '%q' "${DEPLOY_REGION:-global}")")
REMOTE_EXPORTS+=("export DEPLOY_PULL_FROM_MIRROR=$(printf '%q' "${DEPLOY_PULL_FROM_MIRROR:-false}")")
REMOTE_EXPORTS+=("export CONTAINER_MIRROR_IMAGE_PREFIX=$(printf '%q' "${CONTAINER_MIRROR_IMAGE_PREFIX:-}")")
REMOTE_EXPORTS+=("export CONTAINER_MIRROR_REGISTRY=$(printf '%q' "${CONTAINER_MIRROR_REGISTRY:-}")")
REMOTE_EXPORTS+=("export CONTAINER_MIRROR_USERNAME=$(printf '%q' "${CONTAINER_MIRROR_USERNAME:-}")")
REMOTE_EXPORTS+=("export CONTAINER_MIRROR_PASSWORD=$(printf '%q' "${CONTAINER_MIRROR_PASSWORD:-}")")
REMOTE_EXPORTS+=("export GHCR_PULL_TOKEN=$(printf '%q' "${GHCR_PULL_TOKEN:-}")")
REMOTE_EXPORTS+=("export GHCR_LOGIN_USER=$(printf '%q' "${GHCR_LOGIN_USER:-}")")
REMOTE_EXPORTS+=("export APK_MIRROR=$(printf '%q' "${APK_MIRROR:-}")")
REMOTE_EXPORTS+=("export DEPLOY_SMOKE_PUBLIC_HOST=$(printf '%q' "${DEPLOY_SMOKE_PUBLIC_HOST:-$SSH_HOST}")")

REMOTE_SCRIPT="$(printf '%s\n' "${REMOTE_EXPORTS[@]}")"
REMOTE_SCRIPT+=$'\nbash '"$(printf '%q' "$DEPLOY_PATH")"'/scripts/ci/remote-deploy-ghcr.sh"'

echo "🚀 remote-deploy-ghcr.sh on VPS..."
"${ssh_base[@]}" "$SSH_USER@$SSH_HOST" bash -lc "$REMOTE_SCRIPT"

echo "✅ cnb-deploy-vps completed"
