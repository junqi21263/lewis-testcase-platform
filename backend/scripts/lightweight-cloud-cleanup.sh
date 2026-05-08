#!/usr/bin/env bash
# 轻量云辅助清理：主日志轮转（>100MB）、删除超过保留期的归档日志。
# 由 Nest LIGHTWEIGHT_CLOUD_CLEANUP 定时任务或磁盘超阈值时调用；也可由宿主机 cron 独立执行。
set -euo pipefail

LOG_MAX_BYTES="${LIGHTWEIGHT_LOG_MAX_BYTES:-104857600}"
LOG_RETENTION_DAYS="${LIGHTWEIGHT_LOG_RETENTION_DAYS:-3}"
APP_LOG_FILE="${APP_LOG_FILE:-}"
APP_LOG_DIR="${APP_LOG_DIR:-}"

rotate_large_log() {
  local f="$1"
  if [ -z "$f" ] || [ ! -f "$f" ]; then
    return 0
  fi
  local sz
  sz=$(wc -c <"$f" 2>/dev/null | tr -d ' ' || echo 0)
  if [ "${sz:-0}" -gt "$LOG_MAX_BYTES" ]; then
    local bak="${f}.$(date +%Y%m%d%H%M%S)"
    mv "$f" "$bak"
    : >"$f"
    gzip -f "$bak" 2>/dev/null || true
    echo "[lightweight-cloud-cleanup] rotated $f -> ${bak}.gz"
  fi
}

rotate_large_log "${APP_LOG_FILE}"

if [ -n "${APP_LOG_DIR}" ] && [ -d "${APP_LOG_DIR}" ]; then
  # 轮转产物：*.gz、*.log.*（不匹配当前 app.log 本身）
  find "${APP_LOG_DIR}" -maxdepth 1 -type f \( -name '*.gz' -o -name '*.log.*' \) \
    -mtime "+${LOG_RETENTION_DAYS}" -delete 2>/dev/null || true
fi

exit 0
