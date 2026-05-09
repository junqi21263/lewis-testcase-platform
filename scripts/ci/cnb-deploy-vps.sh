#!/usr/bin/env bash
# CNB 云原生构建：空部署（no-op）。流水线成功结束，不构建镜像、不同步、不 SSH。
# 恢复完整 VPS 部署时，请从 Git 历史恢复本文件或合并含完整脚本的提交。
set -euo pipefail

echo "cnb-deploy-vps: 空部署 — 已跳过（无构建、无推送、无 rsync）。"
