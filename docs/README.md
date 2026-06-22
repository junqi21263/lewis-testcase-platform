# 文档目录说明

`docs/` 用于归档项目文档，避免根目录散落说明文件。

## 分层约定

- `deployment/`：部署、发布、平台配置、环境接入与上线验证（如 [deployment/VPS_DOCKER.md](deployment/VPS_DOCKER.md)、[deployment/COMPOSE_FILES.md](deployment/COMPOSE_FILES.md)）。
- `deployment/edgeone/`：EdgeOne 相关文档，按 `guides/`、`configs/`、`scripts/` 分类。
- `development/`：研发流程、分支策略、环境变量、联调清单、路线图等。
- `history/`：里程碑长文存档（`MILESTONES.md`），日常变更以根目录 `CHANGELOG.md` 为准。
- `product/`：PRD、项目使用手册、产品侧说明。
- `qa/`：安全扫描、测试报告摘要。
- `operations/`：运维巡检、发布手册、备份恢复、值班流程（如 [operations/VPS_RELEASE_RUNBOOK.md](operations/VPS_RELEASE_RUNBOOK.md)）。
- `security/`：安全基线、脱敏规则、合规清单（如 [security/SECURITY_BASELINE.md](security/SECURITY_BASELINE.md)）。
- `assets/screenshots/`：README 与评估报告使用的真实产品截图资产。

## 当前推荐阅读顺序

1. [../README.md](../README.md)：项目总入口、架构、快速开始、发布命令、手册入口。
2. [product/PROJECT_USER_MANUAL.md](product/PROJECT_USER_MANUAL.md)：日常使用手册，覆盖 AI 分析、生成、评审、模板评测与设置。
3. [PROJECT_ASSESSMENT_AND_ITERATION_REPORT.md](PROJECT_ASSESSMENT_AND_ITERATION_REPORT.md)：九维完成度评估、风险和迭代路线。
4. [development/TEST_PLAN.md](development/TEST_PLAN.md)：当前测试分层、核心业务验收和发布门禁。
5. [operations/VPS_RELEASE_RUNBOOK.md](operations/VPS_RELEASE_RUNBOOK.md)：develop/main 双环境发布手册。
6. [development/ENVIRONMENT_VARIABLES.md](development/ENVIRONMENT_VARIABLES.md)：后端、前端、AI、Redis、解析相关环境变量。
7. [security/SECURITY_BASELINE.md](security/SECURITY_BASELINE.md)：密钥、CORS、日志脱敏、Redis、上传解析和备份基线。

## 维护规则

- 根目录只保留入口型文档：`README.md`、`CHANGELOG.md`。
- 新增专题文档优先放到 `docs/` 对应子目录，避免重复与断链。
- 使用手册优先维护 Markdown 版 `docs/product/PROJECT_USER_MANUAL.md`，PDF 如需导出走脚本生成，不把手工编辑过的二进制文档作为事实源。
- 若移动文档路径，必须同步更新 `README.md` 与相关脚本中的引用。
