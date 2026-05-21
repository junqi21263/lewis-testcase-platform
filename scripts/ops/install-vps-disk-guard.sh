#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

THRESHOLD="${1:-75}"
if ! [[ "$THRESHOLD" =~ ^[0-9]+$ ]] || [ "$THRESHOLD" -lt 1 ] || [ "$THRESHOLD" -gt 99 ]; then
  echo "Usage: bash scripts/ops/install-vps-disk-guard.sh [threshold_percent]" >&2
  exit 1
fi

ssh testcase-server "sudo mkdir -p /usr/local/bin /var/log"
scp scripts/ops/vps-disk-guard.sh testcase-server:/tmp/vps-disk-guard.sh
ssh testcase-server "sudo install -m 0755 /tmp/vps-disk-guard.sh /usr/local/bin/vps-disk-guard.sh"

CRON_LINE="*/10 * * * * DISK_GUARD_THRESHOLD_PERCENT=${THRESHOLD} /usr/local/bin/vps-disk-guard.sh >> /var/log/vps-disk-guard.log 2>&1"
ssh testcase-server "tmp=\$(mktemp); crontab -l 2>/dev/null | grep -v 'vps-disk-guard.sh' > \"\$tmp\" || true; printf '%s\n' \"$CRON_LINE\" >> \"\$tmp\"; crontab \"\$tmp\"; rm -f \"\$tmp\"; crontab -l"

echo "[install-vps-disk-guard] installed with threshold=${THRESHOLD}%"
