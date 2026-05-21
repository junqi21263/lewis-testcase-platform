# 文档目录说明

`docs/` 用于归档项目文档，避免根目录散落说明文件。

## 分层约定

- `deployment/`：部署、发布、平台配置、环境接入与上线验证（如 [deployment/VPS_DOCKER.md](deployment/VPS_DOCKER.md)、[deployment/COMPOSE_FILES.md](deployment/COMPOSE_FILES.md)）。
- `deployment/edgeone/`：EdgeOne 相关文档，按 `guides/`、`configs/`、`scripts/` 分类。
- `development/`：研发流程、分支策略、环境变量、联调清单、路线图等。
- `history/`：里程碑长文存档（`MILESTONES.md`），日常变更以根目录 `CHANGELOG.md` 为准。
- `qa/`：安全扫描、测试报告摘要。
- `operations/`：运维巡检、发布手册、备份恢复、值班流程（如 [operations/VPS_RELEASE_RUNBOOK.md](operations/VPS_RELEASE_RUNBOOK.md)）。
- `security/`（预留）：安全基线、脱敏规则、合规清单。

## 维护规则

- 根目录只保留入口型文档：`README.md`、`CHANGELOG.md`。
- 新增专题文档优先放到 `docs/` 对应子目录，避免重复与断链。
- 若移动文档路径，必须同步更新 `README.md` 与相关脚本中的引用。
