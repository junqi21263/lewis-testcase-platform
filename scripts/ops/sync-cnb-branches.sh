#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

HELPER="${CNB_GIT_CREDENTIAL_HELPER:-}"
if [[ -z "$HELPER" ]]; then
  for candidate in \
    /Library/Developer/CommandLineTools/usr/libexec/git-core/git-credential-osxkeychain \
    /Applications/Xcode.app/Contents/Developer/usr/libexec/git-core/git-credential-osxkeychain; do
    if [[ -x "$candidate" ]]; then
      HELPER="$candidate"
      break
    fi
  done
fi

if [[ -n "$HELPER" ]]; then
  git config credential.helper "$HELPER"
fi

echo "[sync-cnb] fetching origin and cnb"
git fetch origin
git fetch cnb

echo "[sync-cnb] syncing develop from origin/develop"
git switch develop
git pull --ff-only origin develop
git push cnb develop

echo "[sync-cnb] syncing cnb/main from origin/main"
if git merge-base --is-ancestor cnb/main origin/main; then
  git push cnb origin/main:main
  echo "[sync-cnb] done: cnb develop/main are up to date"
else
  echo "[sync-cnb] cnb/main has commits that are not in origin/main." >&2
  echo "[sync-cnb] review divergence before overwriting production:" >&2
  git log --oneline --left-right --cherry-pick cnb/main...origin/main >&2
  echo >&2
  echo "[sync-cnb] if production should exactly match origin/main, run:" >&2
  echo "  git push cnb origin/main:main --force-with-lease=main" >&2
  exit 2
fi
