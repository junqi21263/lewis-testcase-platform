#!/bin/sh
# CNB 流水线：解析完整镜像前缀到 REGISTRY_PREFIX。
# 平台常注入「仅主机名」的 CNB_DOCKER_REGISTRY=docker.cnb.cool，若直接拼 /backend 会得到
# docker.cnb.cool/backend，Registry API 为 /v2/backend/ → 推送时出现 400 Bad Request。
# 与 scripts/ci/cnb-deploy-vps.sh 中 push_cnb_registry 逻辑一致。
#
# 使用前：source ./scripts/ci/cnb-registry-env.sh
# 依赖：若 CNB_DOCKER_REGISTRY 无路径段，须设置 CNB_REPO_SLUG_LOWERCASE（如 lewis-test/lewis-testcase-platform）。

set -eu

RAW="${CNB_DOCKER_REGISTRY:-docker.cnb.cool}"
case "$RAW" in
  */*)
    REGISTRY_PREFIX="$RAW"
    ;;
  *)
    if [ -z "${CNB_REPO_SLUG_LOWERCASE:-}" ]; then
      echo "cnb-registry-env: CNB_DOCKER_REGISTRY is host-only (${RAW}). Set repository variable CNB_REPO_SLUG_LOWERCASE or use full prefix docker.cnb.cool/group/repo." >&2
      exit 1
    fi
    REGISTRY_PREFIX="${RAW}/${CNB_REPO_SLUG_LOWERCASE}"
    ;;
esac
export REGISTRY_PREFIX
echo "REGISTRY_PREFIX=${REGISTRY_PREFIX}"

# CNB 流水线推送制品库前需登录（见制品库文档）；与 cnb-deploy-vps.sh push_cnb_registry 一致。
# 部署脚本若仅需 REGISTRY_PREFIX、已在远端登录时：export CNB_SKIP_REGISTRY_LOGIN=1 再 source。
REG_HOST="${REGISTRY_PREFIX%%/*}"
export REG_HOST
if [ "${CNB_SKIP_REGISTRY_LOGIN:-}" != "1" ] && [ -n "${CNB_TOKEN:-}" ]; then
  echo "${CNB_TOKEN}" | docker login "${REG_HOST}" -u cnb --password-stdin
fi
