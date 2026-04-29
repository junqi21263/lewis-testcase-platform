# 文档目录说明

`docs/` 用于归档项目文档，避免根目录散落说明文件。

## 分层约定

- `deployment/`：部署、发布、平台配置、环境接入与上线验证。
- `deployment/edgeone/`：EdgeOne 相关文档，按 `guides/`、`configs/`、`scripts/` 分类。
- `development/`：研发流程、功能设计、联调测试计划与开发说明。
- `operations/`（预留）：运维巡检、备份恢复、值班流程。
- `security/`（预留）：安全基线、脱敏规则、合规清单。

## 维护规则

- 根目录只保留入口型文档：`README.md`、`CHANGELOG.md`。
- 新增专题文档优先放到 `docs/` 对应子目录，避免重复与断链。
- 若移动文档路径，必须同步更新 `README.md` 与相关脚本中的引用。
