#!/usr/bin/env bash
set -euo pipefail

THRESHOLD="${DISK_GUARD_THRESHOLD_PERCENT:-75}"
CHECK_PATH="${DISK_GUARD_PATH:-/}"
JOURNAL_RETENTION="${JOURNAL_RETENTION:-7d}"
TMP_RETENTION_DAYS="${TMP_RETENTION_DAYS:-2}"
IMAGE_UNTIL="${DOCKER_IMAGE_PRUNE_UNTIL:-72h}"
BUILDER_UNTIL="${DOCKER_BUILDER_PRUNE_UNTIL:-24h}"
CONTAINER_UNTIL="${DOCKER_CONTAINER_PRUNE_UNTIL:-24h}"

log() {
  echo "[vps-disk-guard] $*"
}

need_sudo() {
  sudo -n true >/dev/null 2>&1 || {
    log "passwordless sudo is required"
    exit 1
  }
}

get_pct() {
  df -P "$CHECK_PATH" 2>/dev/null | awk 'NR==2 {gsub("%", "", $5); print $5}'
}

cleanup_tmp_dir() {
  local dir="$1"
  [ -d "$dir" ] || return 0
  find "$dir" -mindepth 1 -mtime "+${TMP_RETENTION_DAYS}" \
    ! -type s \
    -exec rm -rf {} + 2>/dev/null || true
}

need_sudo
PCT="$(get_pct)"
if ! [ "${PCT:-}" -ge 0 ] 2>/dev/null; then
  log "failed to read disk usage for ${CHECK_PATH}"
  exit 1
fi

if [ "$PCT" -lt "$THRESHOLD" ]; then
  log "usage=${PCT}% below threshold=${THRESHOLD}%"
  exit 0
fi

log "usage=${PCT}% >= threshold=${THRESHOLD}%, starting cleanup"
df -h "$CHECK_PATH" || true

sudo docker builder prune -af --filter "until=${BUILDER_UNTIL}" >/dev/null 2>&1 || true
sudo docker image prune -af --filter "until=${IMAGE_UNTIL}" >/dev/null 2>&1 || true
sudo docker container prune -f --filter "until=${CONTAINER_UNTIL}" >/dev/null 2>&1 || true
sudo docker network prune -f >/dev/null 2>&1 || true

sudo journalctl --vacuum-time="${JOURNAL_RETENTION}" >/dev/null 2>&1 || true
sudo apt-get clean >/dev/null 2>&1 || true
cleanup_tmp_dir /tmp
cleanup_tmp_dir /var/tmp

if [ -x /opt/lewis_testcase_platform/backend/scripts/lightweight-cloud-cleanup.sh ]; then
  sudo bash /opt/lewis_testcase_platform/backend/scripts/lightweight-cloud-cleanup.sh >/dev/null 2>&1 || true
fi

if [ -x /opt/lewis_testcase_platform_dev/backend/scripts/lightweight-cloud-cleanup.sh ]; then
  sudo bash /opt/lewis_testcase_platform_dev/backend/scripts/lightweight-cloud-cleanup.sh >/dev/null 2>&1 || true
fi

NEW_PCT="$(get_pct)"
log "cleanup finished, usage=${NEW_PCT}%"
df -h "$CHECK_PATH" || true
