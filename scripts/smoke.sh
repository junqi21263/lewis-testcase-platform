#!/usr/bin/env bash
set -euo pipefail

echo "[smoke] starting..."

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

COMPOSE_FILE="docker-compose.full.yml"

docker_compose() {
  if sudo docker compose version >/dev/null 2>&1; then
    sudo docker compose -f "$COMPOSE_FILE" "$@"
  else
    sudo docker-compose -f "$COMPOSE_FILE" "$@"
  fi
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

