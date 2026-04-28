#!/usr/bin/env bash
set -euo pipefail

echo "[smoke] starting..."

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.full.yml}"

die() {
  echo "[smoke] ERROR: $*" >&2
  exit 1
}

pick_compose_runner() {
  # Prefer non-sudo (CI / local dev). Only fall back to sudo when:
  # - docker is installed but user has no permission, AND
  # - sudo is non-interactive (sudo -n).
  # IMPORTANT: `docker compose version` may succeed even when the user cannot
  # access the Docker daemon socket. Always probe the daemon (docker info).
  if docker compose version >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
    echo "docker compose"
    return 0
  fi
  if command -v docker-compose >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
    echo "docker-compose"
    return 0
  fi

  if command -v sudo >/dev/null 2>&1; then
    if sudo -n docker compose version >/dev/null 2>&1 && sudo -n docker info >/dev/null 2>&1; then
      echo "sudo -n docker compose"
      return 0
    fi
    if sudo -n docker-compose version >/dev/null 2>&1 && sudo -n docker info >/dev/null 2>&1; then
      echo "sudo -n docker-compose"
      return 0
    fi
  fi

  die "docker compose not available (or requires interactive sudo). Install Docker/Compose, or ensure the user can run docker without password prompt."
}

COMPOSE_RUNNER="$(pick_compose_runner)"

docker_compose() {
  # shellcheck disable=SC2086
  $COMPOSE_RUNNER -f "$COMPOSE_FILE" "$@"
}

echo "[smoke] compose ps"
docker_compose ps

echo "[smoke] waiting for /api/health ..."
ok=0
for i in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1/api/health" | grep -q '"status"[[:space:]]*:[[:space:]]*"ok"'; then
    ok=1
    break
  fi
  sleep 1
done

if [ "$ok" != "1" ]; then
  echo "[smoke] ERROR: /api/health not OK"
  echo "[smoke] dumping recent logs..."
  docker_compose logs --tail=200 || true
  exit 1
fi

echo "[smoke] /api/health OK"
echo "[smoke] done."

