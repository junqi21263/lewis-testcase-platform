#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  bash scripts/ops/vps-sync-rebuild.sh <develop|main> [frontend|backend|all]

Examples:
  bash scripts/ops/vps-sync-rebuild.sh develop frontend
  bash scripts/ops/vps-sync-rebuild.sh develop all
  bash scripts/ops/vps-sync-rebuild.sh main frontend
EOF
}

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "[vps-sync-rebuild] missing command: $1" >&2
    exit 1
  }
}

TARGET_ENV="${1:-}"
TARGET_SERVICE="${2:-all}"

if [ -z "$TARGET_ENV" ]; then
  usage
  exit 1
fi

case "$TARGET_ENV" in
  develop)
    DEPLOY_PATH="/opt/lewis_testcase_platform_dev"
    ENV_FILE=".env.development"
    COMPOSE_FILES="-f docker-compose.full.yml -f docker-compose.dev.override.yml"
    FRONTEND_HOST_PORT="8083"
    POSTGRES_HOST_PORT="5433"
    REDIS_HOST_PORT="6380"
    STACK_PREFIX="testcase_dev"
    BASE_URL="http://127.0.0.1:8083"
    ;;
  main)
    DEPLOY_PATH="/opt/lewis_testcase_platform"
    ENV_FILE=".env"
    COMPOSE_FILES="-f docker-compose.full.yml"
    FRONTEND_HOST_PORT="80"
    POSTGRES_HOST_PORT="5432"
    REDIS_HOST_PORT="6379"
    STACK_PREFIX="testcase"
    BASE_URL="http://127.0.0.1"
    ;;
  *)
    echo "[vps-sync-rebuild] invalid env: $TARGET_ENV" >&2
    usage
    exit 1
    ;;
esac

case "$TARGET_SERVICE" in
  frontend)
    SERVICES="frontend"
    ;;
  backend)
    SERVICES="backend"
    ;;
  all)
    SERVICES="frontend backend"
    ;;
  *)
    echo "[vps-sync-rebuild] invalid service: $TARGET_SERVICE" >&2
    usage
    exit 1
    ;;
esac

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

need_cmd rsync
need_cmd ssh

echo "[vps-sync-rebuild] syncing local repo to testcase-server:${DEPLOY_PATH}"
ssh testcase-server "sudo mkdir -p '$DEPLOY_PATH'"
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
  ./ "testcase-server:${DEPLOY_PATH}/"

REMOTE_CMD=$(
  cat <<EOF
set -euo pipefail
cd '$DEPLOY_PATH'
export STACK_PREFIX='$STACK_PREFIX'
export FRONTEND_HOST_PORT='$FRONTEND_HOST_PORT'
export POSTGRES_HOST_PORT='$POSTGRES_HOST_PORT'
export REDIS_HOST_PORT='$REDIS_HOST_PORT'
sudo -E docker compose $COMPOSE_FILES --env-file '$ENV_FILE' build $SERVICES
sudo -E docker compose $COMPOSE_FILES --env-file '$ENV_FILE' up -d --force-recreate $SERVICES
curl -s http://127.0.0.1/health >/dev/null 2>&1 || true
EOF
)

echo "[vps-sync-rebuild] rebuilding ${TARGET_ENV} ${TARGET_SERVICE}"
ssh testcase-server "$REMOTE_CMD"

if [ "$TARGET_SERVICE" = "backend" ]; then
  ssh testcase-server "curl -s http://127.0.0.1:3000/health"
else
  ssh testcase-server "curl -I -s '$BASE_URL/ai-analysis' | head -n 20; printf '\n---\n'; curl -I -s '$BASE_URL/assets/not-real-asset.js' | head -n 20"
fi

echo "[vps-sync-rebuild] done"
