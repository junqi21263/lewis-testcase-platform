#!/usr/bin/env bash
# 从整库 Git 历史中移除误提交路径（解决 GitHub secret scanning 拒 push）。
# 使用前：到 OpenAI 等平台作废已暴露的密钥并换新，历史改写不能撤销密钥泄露风险。
#
# 依赖：git-filter-repo（https://github.com/newren/git-filter-repo）
#   pip install git-filter-repo
#   或 brew install git-filter-repo
#
# 用法（在仓库根目录）：
#   FORCE_PURGE=1 ./scripts/git/purge-secret-paths-from-history.sh
# 然后按需强推（示例）：
#   git push github main --force-with-lease
#   git push github develop --force-with-lease
#   git push origin main --force-with-lease   # CNB 若与本地同源历史也需同步

set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

if [[ "${FORCE_PURGE:-}" != "1" ]]; then
  echo "Refusing to run without FORCE_PURGE=1 (rewrites all refs in this clone)."
  echo "Example: FORCE_PURGE=1 $0"
  exit 1
fi

if ! command -v git-filter-repo >/dev/null 2>&1; then
  echo "git-filter-repo not found. Install: pip install git-filter-repo  OR  brew install git-filter-repo"
  exit 1
fi

# 与 GitHub push protection 报错的典型误提交路径对齐；可按需追加 --path 再执行一次
PATHS=(
  "PycharmProjects"
)

args=()
for p in "${PATHS[@]}"; do
  args+=(--path "$p")
done
args+=(--invert-paths --force)

echo "Removing from all history: ${PATHS[*]}"
git filter-repo "${args[@]}"

echo "Done. Verify: git log --oneline -5"
echo "Then rotate API keys if not already, and: git push <remote> <branch> --force-with-lease"
