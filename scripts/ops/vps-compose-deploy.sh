#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  scripts/ops/vps-compose-deploy.sh <develop|main> [frontend|backend|all|env]

Wrappers:
  scripts/ops/deploy-develop.sh [frontend|backend|all|env]
  scripts/ops/deploy-main.sh [frontend|backend|all|env]

Defaults:
  DEPLOY_MODE=image        Pull CNB prebuilt images and recreate containers.
  VPS_HOST=testcase-server SSH host alias.
  SYNC_SOURCE=1           Rsync repo files to the VPS, excluding env/data/build artifacts.

Useful overrides:
  DEPLOY_MODE=build        Build images on the VPS from synced source.
  IMAGE_PREFIX=...         Default: docker.cnb.cool/lewis-test/lewis-testcase-platform.
  CNB_REGISTRY_PULL_TOKEN  Optional docker login token for private CNB registry pulls.
  CNB_REGISTRY_LOGIN_USER  Optional docker login user, default: cnb.

Examples:
  scripts/ops/deploy-develop.sh frontend
  scripts/ops/deploy-develop.sh all
  scripts/ops/deploy-main.sh all
  DEPLOY_MODE=build scripts/ops/deploy-main.sh frontend
EOF
}

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "[vps-compose-deploy] missing command: $1" >&2
    exit 1
  }
}

shell_quote() {
  printf "%q" "$1"
}

TARGET_ENV="${1:-}"
TARGET_SERVICE="${2:-all}"

if [ -z "$TARGET_ENV" ]; then
  usage
  exit 1
fi

case "$TARGET_SERVICE" in
  frontend|backend|all|env) ;;
  *)
    echo "[vps-compose-deploy] invalid service: $TARGET_SERVICE" >&2
    usage
    exit 1
    ;;
esac

VPS_HOST="${VPS_HOST:-testcase-server}"
DEPLOY_MODE="${DEPLOY_MODE:-image}"
SYNC_SOURCE="${SYNC_SOURCE:-1}"
IMAGE_PREFIX="${IMAGE_PREFIX:-docker.cnb.cool/lewis-test/lewis-testcase-platform}"
CNB_REGISTRY_LOGIN_USER="${CNB_REGISTRY_LOGIN_USER:-cnb}"
REGISTRY_HOST="${IMAGE_PREFIX%%/*}"

case "$DEPLOY_MODE" in
  image|build) ;;
  *)
    echo "[vps-compose-deploy] invalid DEPLOY_MODE: $DEPLOY_MODE" >&2
    exit 1
    ;;
esac

case "$TARGET_ENV" in
  develop)
    DEPLOY_PATH="${DEPLOY_PATH:-/opt/lewis_testcase_platform_dev}"
    ENV_FILE="${ENV_FILE:-.env.development}"
    STACK_PREFIX="${STACK_PREFIX:-testcase_dev}"
    FRONTEND_HOST_PORT="${FRONTEND_HOST_PORT:-8083}"
    BACKEND_HOST_PORT="${BACKEND_HOST_PORT:-3000}"
    POSTGRES_HOST_PORT="${POSTGRES_HOST_PORT:-5433}"
    REDIS_HOST_PORT="${REDIS_HOST_PORT:-6380}"
    IMAGE_TAG="${IMAGE_TAG:-dev}"
    BASE_URL="${BASE_URL:-http://127.0.0.1:${FRONTEND_HOST_PORT}}"
    IMAGE_COMPOSE_FILES="-f docker-compose.ghcr.yml -f docker-compose.dev.override.yml"
    BUILD_COMPOSE_FILES="-f docker-compose.full.yml -f docker-compose.dev.override.yml"
    ;;
  main)
    DEPLOY_PATH="${DEPLOY_PATH:-/opt/lewis_testcase_platform}"
    ENV_FILE="${ENV_FILE:-.env}"
    STACK_PREFIX="${STACK_PREFIX:-testcase}"
    FRONTEND_HOST_PORT="${FRONTEND_HOST_PORT:-80}"
    BACKEND_HOST_PORT="${BACKEND_HOST_PORT:-3000}"
    POSTGRES_HOST_PORT="${POSTGRES_HOST_PORT:-5432}"
    REDIS_HOST_PORT="${REDIS_HOST_PORT:-6379}"
    IMAGE_TAG="${IMAGE_TAG:-latest}"
    BASE_URL="${BASE_URL:-http://127.0.0.1}"
    IMAGE_COMPOSE_FILES="-f docker-compose.ghcr.yml"
    BUILD_COMPOSE_FILES="-f docker-compose.full.yml"
    ;;
  *)
    echo "[vps-compose-deploy] invalid env: $TARGET_ENV" >&2
    usage
    exit 1
    ;;
esac

case "$TARGET_SERVICE" in
  frontend)
    SERVICES="frontend"
    PULL_SERVICES="frontend"
    ;;
  backend)
    SERVICES="backend"
    PULL_SERVICES="backend"
    ;;
  all|env)
    SERVICES="frontend backend"
    PULL_SERVICES="frontend backend"
    ;;
esac

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

need_cmd ssh
if [ "$SYNC_SOURCE" = "1" ]; then
  need_cmd rsync
fi

echo "[vps-compose-deploy] env=$TARGET_ENV service=$TARGET_SERVICE mode=$DEPLOY_MODE host=$VPS_HOST path=$DEPLOY_PATH"

if [ "$SYNC_SOURCE" = "1" ]; then
  echo "[vps-compose-deploy] syncing repository files to $VPS_HOST:$DEPLOY_PATH"
  ssh "$VPS_HOST" "sudo mkdir -p $(shell_quote "$DEPLOY_PATH")"
  rsync -az --delete \
    --rsync-path="sudo rsync" \
    -e "ssh -o StrictHostKeyChecking=accept-new" \
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
    ./ "$VPS_HOST:$DEPLOY_PATH/"
fi

if [ "$DEPLOY_MODE" = "image" ] && [ -n "${CNB_REGISTRY_PULL_TOKEN:-}" ]; then
  echo "[vps-compose-deploy] docker login on VPS registry=$REGISTRY_HOST"
  printf "%s\n" "$CNB_REGISTRY_PULL_TOKEN" |
    ssh -T "$VPS_HOST" "sudo docker login $(shell_quote "$REGISTRY_HOST") -u $(shell_quote "$CNB_REGISTRY_LOGIN_USER") --password-stdin"
fi

BACKEND_IMAGE="${BACKEND_IMAGE:-${IMAGE_PREFIX}/backend:${IMAGE_TAG}}"
FRONTEND_IMAGE="${FRONTEND_IMAGE:-${IMAGE_PREFIX}/frontend:${IMAGE_TAG}}"
APK_MIRROR="${APK_MIRROR:-mirrors.aliyun.com}"

REMOTE_ENV=$(cat <<EOF
export TARGET_ENV=$(shell_quote "$TARGET_ENV")
export TARGET_SERVICE=$(shell_quote "$TARGET_SERVICE")
export DEPLOY_MODE=$(shell_quote "$DEPLOY_MODE")
export DEPLOY_PATH=$(shell_quote "$DEPLOY_PATH")
export ENV_FILE=$(shell_quote "$ENV_FILE")
export STACK_PREFIX=$(shell_quote "$STACK_PREFIX")
export FRONTEND_HOST_PORT=$(shell_quote "$FRONTEND_HOST_PORT")
export BACKEND_HOST_PORT=$(shell_quote "$BACKEND_HOST_PORT")
export POSTGRES_HOST_PORT=$(shell_quote "$POSTGRES_HOST_PORT")
export REDIS_HOST_PORT=$(shell_quote "$REDIS_HOST_PORT")
export BASE_URL=$(shell_quote "$BASE_URL")
export IMAGE_COMPOSE_FILES=$(shell_quote "$IMAGE_COMPOSE_FILES")
export BUILD_COMPOSE_FILES=$(shell_quote "$BUILD_COMPOSE_FILES")
export SERVICES=$(shell_quote "$SERVICES")
export PULL_SERVICES=$(shell_quote "$PULL_SERVICES")
export BACKEND_IMAGE=$(shell_quote "$BACKEND_IMAGE")
export FRONTEND_IMAGE=$(shell_quote "$FRONTEND_IMAGE")
export APK_MIRROR=$(shell_quote "$APK_MIRROR")
EOF
)

ssh "$VPS_HOST" "bash -s" <<REMOTE
set -euo pipefail
$REMOTE_ENV

cd "\$DEPLOY_PATH"
if [ ! -f "\$ENV_FILE" ]; then
  echo "[vps-compose-deploy] missing \$DEPLOY_PATH/\$ENV_FILE" >&2
  exit 1
fi

if [ "\$DEPLOY_MODE" = "image" ]; then
  COMPOSE_FILES="\$IMAGE_COMPOSE_FILES"
else
  COMPOSE_FILES="\$BUILD_COMPOSE_FILES"
fi

compose_env=(
  DOCKER_BUILDKIT=1
  BUILDKIT_PROGRESS=plain
  COMPOSE_ENV_FILE="\$ENV_FILE"
  STACK_PREFIX="\$STACK_PREFIX"
  FRONTEND_HOST_PORT="\$FRONTEND_HOST_PORT"
  BACKEND_HOST_PORT="\$BACKEND_HOST_PORT"
  POSTGRES_HOST_PORT="\$POSTGRES_HOST_PORT"
  REDIS_HOST_PORT="\$REDIS_HOST_PORT"
  APK_MIRROR="\$APK_MIRROR"
  BACKEND_IMAGE="\$BACKEND_IMAGE"
  FRONTEND_IMAGE="\$FRONTEND_IMAGE"
)

echo "[vps-compose-deploy] compose files: \$COMPOSE_FILES"
echo "[vps-compose-deploy] backend image: \$BACKEND_IMAGE"
echo "[vps-compose-deploy] frontend image: \$FRONTEND_IMAGE"

cleanup_legacy_cnb_containers() {
  case "\$TARGET_ENV" in
    develop)
      legacy_names="your-app-frontend-dev your-app-backend-dev your-app-parse-worker-dev"
      ;;
    main)
      legacy_names="your-app-frontend-prod your-app-backend-prod your-app-parse-worker-prod"
      ;;
    *)
      legacy_names=""
      ;;
  esac

  [ -n "\$legacy_names" ] || return 0

  for legacy_name in \$legacy_names; do
    if sudo docker inspect "\$legacy_name" >/dev/null 2>&1; then
      echo "[vps-compose-deploy] removing legacy CNB docker-run container: \$legacy_name"
      sudo docker rm -f "\$legacy_name" >/dev/null
    fi
  done
}

cleanup_legacy_cnb_containers

if [ "\$DEPLOY_MODE" = "image" ] && [ "\$TARGET_SERVICE" != "env" ]; then
  sudo env "\${compose_env[@]}" docker compose --env-file "\$ENV_FILE" \$COMPOSE_FILES pull \$PULL_SERVICES
fi

up_extra=()
if [ "\$TARGET_SERVICE" = "frontend" ]; then
  # Frontend depends_on backend in compose so nginx can proxy /api, but a frontend-only
  # release must not recreate or rebuild the backend container.
  up_extra+=(--no-deps)
fi

if [ "\$DEPLOY_MODE" = "build" ]; then
  if [ "\$TARGET_SERVICE" = "env" ]; then
    sudo env "\${compose_env[@]}" docker compose --env-file "\$ENV_FILE" \$COMPOSE_FILES up -d --force-recreate \$SERVICES
  else
    sudo env "\${compose_env[@]}" docker compose --env-file "\$ENV_FILE" \$COMPOSE_FILES build \$SERVICES
    sudo env "\${compose_env[@]}" docker compose --env-file "\$ENV_FILE" \$COMPOSE_FILES up -d --no-build --force-recreate "\${up_extra[@]}" \$SERVICES
  fi
else
  sudo env "\${compose_env[@]}" docker compose --env-file "\$ENV_FILE" \$COMPOSE_FILES up -d --force-recreate "\${up_extra[@]}" \$SERVICES
fi

sudo env "\${compose_env[@]}" docker compose --env-file "\$ENV_FILE" \$COMPOSE_FILES ps

backend_container="\${STACK_PREFIX}_backend"
if [ "\$TARGET_SERVICE" = "backend" ] || [ "\$TARGET_SERVICE" = "all" ] || [ "\$TARGET_SERVICE" = "env" ]; then
  for i in \$(seq 1 90); do
    status=\$(sudo docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "\$backend_container" 2>/dev/null || echo missing)
    echo "[vps-compose-deploy] backend health=\$status"
    [ "\$status" = "healthy" ] && break
    sleep 2
  done
fi

if [ "\$TARGET_ENV" = "develop" ] && { [ "\$TARGET_SERVICE" = "backend" ] || [ "\$TARGET_SERVICE" = "all" ] || [ "\$TARGET_SERVICE" = "env" ]; }; then
  curl -fsS "http://127.0.0.1:\$BACKEND_HOST_PORT/health" >/dev/null
fi

curl -fsS "\$BASE_URL/health" >/dev/null
curl -fsSI "\$BASE_URL/ai-analysis" | head -20

echo "[vps-compose-deploy] deployed \$TARGET_ENV \$TARGET_SERVICE"
REMOTE

echo "[vps-compose-deploy] done"
