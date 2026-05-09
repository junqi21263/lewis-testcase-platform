#!/usr/bin/env bash
# 在 VPS 上执行（rsync 之后）。由 GitHub Actions / CNB 通过 SSH 调用。
# 依赖环境变量见文末说明。
set -euo pipefail

: "${DEPLOY_ENV:?}"
: "${DEPLOY_PATH:?}"
: "${ENV_FILE:?}"
: "${DEPLOY_SHA:?}"
: "${GHCR_REPO_LOWER:?}"

cd "$DEPLOY_PATH"
echo "🚀 Deploying to ${DEPLOY_ENV} environment at $DEPLOY_PATH"

REGION="${DEPLOY_REGION:-global}"
case "${REGION}" in
  cn)
    echo "🔧 DEPLOY_REGION=cn: merging CN-oriented Docker Hub registry mirrors into daemon.json..."
    sudo mkdir -p /etc/docker
    if command -v python3 >/dev/null 2>&1; then
      MERGE_OUT=$(sudo python3 "$DEPLOY_PATH/scripts/merge-docker-mirrors.py")
      if [ "$MERGE_OUT" = "restart" ]; then
        echo "✅ daemon.json updated, restarting Docker..."
        sudo systemctl daemon-reload
        sudo systemctl restart docker
        sleep 5
      else
        echo "✅ registry mirrors already satisfied"
      fi
    else
      echo "⚠️ python3 not found; cannot merge daemon.json. Install python3 or configure mirrors manually."
    fi
    ;;
  *)
    echo "🔧 DEPLOY_REGION=${REGION}: skipping CN Docker Hub mirrors (set DEPLOY_REGION=cn on mainland China VPS if pulls are slow)"
    ;;
esac

sudo mkdir -p "$DEPLOY_PATH"
if [ ! -f "$DEPLOY_PATH/$ENV_FILE" ]; then
  echo "⚠️  $ENV_FILE not found, copying from example..."
  if [ -f "$DEPLOY_PATH/$ENV_FILE.example" ]; then
    sudo cp "$DEPLOY_PATH/$ENV_FILE.example" "$DEPLOY_PATH/$ENV_FILE"
    echo "✅ Created $ENV_FILE from template. Please edit it with production values!"
  fi
fi

if [ "$DEPLOY_ENV" = "development" ]; then
  sudo sed -i '/^FRONTEND_HOST_BIND=/d;/^FRONTEND_HOST_PORT=/d;/^POSTGRES_HOST_BIND=/d;/^POSTGRES_HOST_PORT=/d;/^REDIS_HOST_BIND=/d;/^REDIS_HOST_PORT=/d' "$DEPLOY_PATH/$ENV_FILE"
  sudo bash -c "printf '\nFRONTEND_HOST_BIND=0.0.0.0\nFRONTEND_HOST_PORT=8080\nPOSTGRES_HOST_BIND=127.0.0.1\nPOSTGRES_HOST_PORT=5433\nREDIS_HOST_BIND=127.0.0.1\nREDIS_HOST_PORT=6380\n' >> '$DEPLOY_PATH/$ENV_FILE'"
fi

if [ "$DEPLOY_ENV" = "development" ]; then
  echo "🧹 Cleaning up old development containers..."
  sudo docker stop testcase_dev_redis testcase_dev_postgres testcase_dev_backend testcase_dev_frontend 2>/dev/null || true
  sudo docker rm testcase_dev_redis testcase_dev_postgres testcase_dev_backend testcase_dev_frontend 2>/dev/null || true
  echo "✅ Old containers cleaned up"
fi

if [ "$DEPLOY_ENV" = "development" ]; then
  STACK_PREFIX="${STACK_PREFIX:-testcase_dev}"
  export FRONTEND_HOST_PORT=8080
  export POSTGRES_HOST_PORT=5433
  export REDIS_HOST_PORT=6380
else
  STACK_PREFIX="${STACK_PREFIX:-testcase}"
  export FRONTEND_HOST_PORT=80
  export POSTGRES_HOST_PORT=5432
  export REDIS_HOST_PORT=6379
fi
export STACK_PREFIX
export COMPOSE_ENV_FILE="$ENV_FILE"

SHA="$DEPLOY_SHA"
if [ "${DEPLOY_PULL_FROM_MIRROR:-false}" = "true" ]; then
  echo "📦 Domestic mirror pull (no ghcr.io on VPS)."
  : "${CONTAINER_MIRROR_IMAGE_PREFIX:?}"
  : "${CONTAINER_MIRROR_REGISTRY:?}"
  : "${CONTAINER_MIRROR_USERNAME:?}"
  : "${CONTAINER_MIRROR_PASSWORD:?}"
  export BACKEND_IMAGE="${CONTAINER_MIRROR_IMAGE_PREFIX}/backend:${SHA}"
  export FRONTEND_IMAGE="${CONTAINER_MIRROR_IMAGE_PREFIX}/frontend:${SHA}"
  echo "$CONTAINER_MIRROR_PASSWORD" | sudo docker login "$CONTAINER_MIRROR_REGISTRY" -u "$CONTAINER_MIRROR_USERNAME" --password-stdin
else
  echo "📦 GHCR prebuilt images (docker-compose.ghcr.yml); VPS pull ghcr.io."
  export BACKEND_IMAGE="ghcr.io/${GHCR_REPO_LOWER}/backend:${SHA}"
  export FRONTEND_IMAGE="ghcr.io/${GHCR_REPO_LOWER}/frontend:${SHA}"
  if [ -n "${GHCR_PULL_TOKEN:-}" ]; then
    : "${GHCR_LOGIN_USER:?}"
    echo "$GHCR_PULL_TOKEN" | sudo docker login ghcr.io -u "$GHCR_LOGIN_USER" --password-stdin
  fi
fi

if [ "$DEPLOY_ENV" = "development" ]; then
  COMPOSE_FILES="-f docker-compose.ghcr.yml -f docker-compose.dev.override.yml"
else
  COMPOSE_FILES="-f docker-compose.ghcr.yml"
fi
SMOKE_COMPOSE_FILE="docker-compose.ghcr.yml"

if [ -n "${APK_MIRROR:-}" ]; then
  export APK_MIRROR
  echo "📦 APK_MIRROR from CI: $APK_MIRROR"
fi

deploy_compose_env=(DOCKER_BUILDKIT=1 BUILDKIT_PROGRESS=plain STACK_PREFIX="$STACK_PREFIX" FRONTEND_HOST_PORT="$FRONTEND_HOST_PORT" POSTGRES_HOST_PORT="$POSTGRES_HOST_PORT" REDIS_HOST_PORT="$REDIS_HOST_PORT")
if [ -n "${APK_MIRROR:-}" ]; then
  deploy_compose_env+=(APK_MIRROR="$APK_MIRROR")
fi
deploy_compose_env+=(BACKEND_IMAGE="$BACKEND_IMAGE" FRONTEND_IMAGE="$FRONTEND_IMAGE")

if sudo docker compose version >/dev/null 2>&1; then
  pull_ok=0
  for attempt in 1 2 3 4 5; do
    echo "📥 docker compose pull backend frontend (attempt $attempt/5)..."
    if sudo env "${deploy_compose_env[@]}" docker compose $COMPOSE_FILES --env-file "$ENV_FILE" pull backend frontend; then
      pull_ok=1
      break
    fi
    echo "⚠️ Pull failed (network?), retry in 25s..."
    sleep 25
  done
  if [ "$pull_ok" != "1" ]; then
    echo "::error::docker compose pull failed after 5 attempts"
    exit 1
  fi
  sudo env "${deploy_compose_env[@]}" docker compose $COMPOSE_FILES --env-file "$ENV_FILE" up -d
else
  pull_ok=0
  for attempt in 1 2 3 4 5; do
    echo "📥 docker-compose pull backend frontend (attempt $attempt/5)..."
    if sudo env "${deploy_compose_env[@]}" docker-compose $COMPOSE_FILES --env-file "$ENV_FILE" pull backend frontend; then
      pull_ok=1
      break
    fi
    echo "⚠️ Pull failed (network?), retry in 25s..."
    sleep 25
  done
  if [ "$pull_ok" != "1" ]; then
    echo "::error::docker-compose pull failed after 5 attempts"
    exit 1
  fi
  sudo env "${deploy_compose_env[@]}" docker-compose $COMPOSE_FILES --env-file "$ENV_FILE" up -d
fi

echo "✅ Deployment to ${DEPLOY_ENV} completed"

if [ "$DEPLOY_ENV" = "development" ]; then
  echo "🧪 Running development smoke check on port 8080..."
  ok=0
  for i in $(seq 1 60); do
    if curl -fsS "http://127.0.0.1:8080/health" 2>/dev/null | grep -qE '^[[:space:]]*ok[[:space:]]*$|\"status\"[[:space:]]*:[[:space:]]*\"ok\"'; then
      ok=1
      break
    fi
    sleep 2
  done
  if [ "$ok" != "1" ]; then
    echo "❌ Smoke check failed after ~120s (60 attempts × 2s)"
    sudo env "${deploy_compose_env[@]}" docker compose $COMPOSE_FILES --env-file "$ENV_FILE" ps || true
    sudo env "${deploy_compose_env[@]}" docker compose $COMPOSE_FILES --env-file "$ENV_FILE" logs --tail=100 backend frontend || true
    exit 1
  fi
  echo "✅ Smoke check passed"
  if [ -n "${DEPLOY_SMOKE_PUBLIC_HOST:-}" ]; then
    echo "访问地址: http://${DEPLOY_SMOKE_PUBLIC_HOST}:8080"
  fi
else
  env STACK_PREFIX="$STACK_PREFIX" COMPOSE_ENV_FILE="$ENV_FILE" COMPOSE_FILE="$SMOKE_COMPOSE_FILE" bash scripts/smoke.sh
fi
