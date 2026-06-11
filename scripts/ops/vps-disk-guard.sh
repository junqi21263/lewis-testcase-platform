#!/usr/bin/env bash
set -euo pipefail

THRESHOLD="${DISK_GUARD_THRESHOLD_PERCENT:-75}"
CHECK_PATH="${DISK_GUARD_PATH:-/}"
JOURNAL_RETENTION="${JOURNAL_RETENTION:-7d}"
TMP_RETENTION_DAYS="${TMP_RETENTION_DAYS:-2}"
IMAGE_UNTIL="${DOCKER_IMAGE_PRUNE_UNTIL:-72h}"
BUILDER_UNTIL="${DOCKER_BUILDER_PRUNE_UNTIL:-24h}"
CONTAINER_UNTIL="${DOCKER_CONTAINER_PRUNE_UNTIL:-24h}"
DOCKER_LOG_TRUNCATE_SIZE_MB="${DOCKER_LOG_TRUNCATE_SIZE_MB:-50}"
CLEAN_ROOT_PACKAGE_CACHES="${CLEAN_ROOT_PACKAGE_CACHES:-1}"
CLEAN_PROJECT_TEST_ARTIFACTS="${CLEAN_PROJECT_TEST_ARTIFACTS:-1}"

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

cleanup_dir_contents() {
  local dir="$1"
  [ -d "$dir" ] || return 0
  log "cleaning directory contents: ${dir}"
  sudo find "$dir" -mindepth 1 -maxdepth 1 -exec rm -rf {} + 2>/dev/null || true
}

cleanup_root_package_caches() {
  [ "$CLEAN_ROOT_PACKAGE_CACHES" = "1" ] || return 0

  cleanup_dir_contents /root/.npm/_cacache
  cleanup_dir_contents /root/.npm/_npx
  cleanup_dir_contents /root/.cache/pnpm
  cleanup_dir_contents /root/.cache/pip
  cleanup_dir_contents /root/.cache/node-gyp
  cleanup_dir_contents /root/.cache/ms-playwright
}

cleanup_project_test_artifacts() {
  [ "$CLEAN_PROJECT_TEST_ARTIFACTS" = "1" ] || return 0

  local root
  for root in /opt/lewis_testcase_platform /opt/lewis_testcase_platform_dev; do
    [ -d "$root" ] || continue
    cleanup_dir_contents "$root/frontend/allure-results"
    cleanup_dir_contents "$root/frontend/allure-report"
    cleanup_dir_contents "$root/frontend/test-results"
    cleanup_dir_contents "$root/frontend/playwright/.cache"
    cleanup_dir_contents "$root/.pnpm-store"
  done
}

truncate_large_docker_logs() {
  [ -d /var/lib/docker/containers ] || return 0
  log "truncating docker json logs larger than ${DOCKER_LOG_TRUNCATE_SIZE_MB}MB"
  sudo find /var/lib/docker/containers \
    -name '*-json.log' \
    -type f \
    -size "+${DOCKER_LOG_TRUNCATE_SIZE_MB}M" \
    -exec sh -c ': > "$1"' sh {} \; 2>/dev/null || true
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
truncate_large_docker_logs

sudo journalctl --vacuum-time="${JOURNAL_RETENTION}" >/dev/null 2>&1 || true
sudo apt-get clean >/dev/null 2>&1 || true
cleanup_tmp_dir /tmp
cleanup_tmp_dir /var/tmp
cleanup_root_package_caches
cleanup_project_test_artifacts

if [ -x /opt/lewis_testcase_platform/backend/scripts/lightweight-cloud-cleanup.sh ]; then
  sudo bash /opt/lewis_testcase_platform/backend/scripts/lightweight-cloud-cleanup.sh >/dev/null 2>&1 || true
fi

if [ -x /opt/lewis_testcase_platform_dev/backend/scripts/lightweight-cloud-cleanup.sh ]; then
  sudo bash /opt/lewis_testcase_platform_dev/backend/scripts/lightweight-cloud-cleanup.sh >/dev/null 2>&1 || true
fi

NEW_PCT="$(get_pct)"
log "cleanup finished, usage=${NEW_PCT}%"
df -h "$CHECK_PATH" || true
