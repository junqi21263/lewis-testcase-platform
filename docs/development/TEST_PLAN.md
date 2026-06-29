# 测试计划与发布门禁

本文档描述当前项目的测试分层、核心业务验收路径和发布前门禁。旧版认证专项测试计划已不再覆盖当前主业务，本版以 AI 需求分析、用例生成、评审中心、文件解析、Redis 实时态和部署验证为核心。

## 测试目标

- 保证需求文档/PDF 能稳定上传、解析、进入 AI 分析。
- 保证 AI 长输出、自动续写、结构化修复、质量评分和覆盖矩阵不回归。
- 保证生成用例页、评审中心、版本 diff、执行结果导入可用。
- 保证 Redis 缓存/实时进度/轻量队列可用，并在 Redis 不可用时降级。
- 保证 develop/main 发布脚本能重建容器并通过健康检查。

## 测试分层

| 层级 | 命令 | 作用 |
| --- | --- | --- |
| 后端单元/集成 | `pnpm -C backend test` | AI 输出、PDF 流程图解析、覆盖矩阵、Redis runtime、OCR 缓存、安全边界 |
| 后端构建 | `pnpm -C backend build` | Nest 编译、依赖注入、类型检查 |
| 前端单测 | `pnpm -C frontend test:unit` | API client、导出、Mermaid、分页、评审工具函数 |
| 前端构建 | `pnpm -C frontend build` | TypeScript 与 Vite 生产构建 |
| Playwright E2E | `pnpm -C frontend test:e2e -- tests/e2e/ai-analysis.spec.ts tests/e2e/reviews-center.spec.ts` | AI 分析页和评审中心主流程 |
| Playwright CT | `pnpm -C frontend test:ct` | 核心组件渲染和交互 |
| VPS smoke | `bash scripts/ops/deploy-develop.sh all` 后 curl | 容器重建、健康检查、页面可访问 |

## 标准发布前门禁

```bash
pnpm -C backend exec prisma generate --schema=./prisma/schema.prod.prisma
pnpm -C backend test
pnpm -C backend build
pnpm -C frontend test:unit
pnpm -C frontend build
pnpm -C frontend test:e2e -- tests/e2e/ai-analysis.spec.ts tests/e2e/reviews-center.spec.ts
```

涉及评审中心、生成记录或 Agent 执行结果时，追加：

```bash
pnpm -C frontend test:e2e -- tests/e2e/agents-full-flow.spec.ts tests/e2e/reviews-center.spec.ts
```

涉及 UI 组件渲染时，追加：

```bash
pnpm -C frontend test:ct
```

## 核心业务验收场景

### 1. AI 需求分析

| 编号 | 场景 | 验收点 | 自动化覆盖 |
| --- | --- | --- | --- |
| A1 | 上传 mock PDF 并等待解析 | 上传状态、解析等待、502 自动重试、解析结果恢复 | `frontend/tests/e2e/ai-analysis.spec.ts` |
| A2 | 输入文本并流式分析 | SSE 分片渲染、完成日志、人工审阅开关 | `ai-analysis.spec.ts` |
| A3 | 结构化报告展示 | 评分卡、待确认问题、低质量输入提醒、测试策略、Agent 准备清单 | 后端 `analysis-structured-report.spec.ts` |
| A4 | 报告版本 | v1/v2 列表、diff、修订说明 | 后端 `analysis-report-version.spec.ts`，前端 E2E |
| A5 | 多模型交叉评审 | `pending/running/success/skipped/failed` 状态可追踪 | 后端 `ai.service` 相关路径，需补 live smoke |

### 2. 流程图 PDF 专项

| 编号 | 场景 | 验收点 | 自动化覆盖 |
| --- | --- | --- | --- |
| F1 | Mermaid/箭头文本解析 | 节点、分支、路径、异常路径、`TP-ID` | `backend/test/pdf-flowchart-parse.spec.ts` |
| F2 | 流程图上下文进入用例生成 | prompt 包含流程路径，生成用例带 `testPathIds` | `backend/test/ai-flowchart-context.spec.ts` |
| F3 | 低质量流程图提醒 | 节点少于 3、分支少于 1 时给出 input warning | `analysis-structured-report.spec.ts` |

### 3. 用例生成

| 编号 | 场景 | 验收点 | 自动化覆盖 |
| --- | --- | --- | --- |
| G1 | 流式生成 | 分片输出、长输出提示、自动续写、最终入库 | 后端 `ai-output-budget.spec.ts` |
| G2 | schema 修复 | 缺 `requirementIds/testPathIds/automationReadiness` 时补齐 | `ai-output-schema.spec.ts` |
| G3 | 低相关用例过滤 | 元指令不被当作真实需求点 | `ai-output-quality.spec.ts` |
| G4 | 分页显示 | 每页 20/30/50 条，不出现空白渲染 | `generateCasePagination.unit.test.ts` |

### 4. 评审中心和覆盖矩阵

| 编号 | 场景 | 验收点 | 自动化覆盖 |
| --- | --- | --- | --- |
| R1 | 进入评审工作区 | 记录、用例列表、摘要可加载 | `reviews-center.spec.ts` |
| R2 | 结构化编辑 | 保存后版本号增加 | `reviews-center.spec.ts` |
| R3 | 评论与状态 | 评论提交、状态更新 | `reviews-center.spec.ts` |
| R4 | 执行结果导入 | 按 `caseId > tpId > reqId > title` 匹配并回写 | `reviews-execution-results.spec.ts` |
| R5 | 覆盖矩阵 | 需求、用例、自动化可行性、最新执行状态展示 | `reviews-execution-results.spec.ts` |

### 5. Redis 与长任务

| 编号 | 场景 | 验收点 | 自动化覆盖 |
| --- | --- | --- | --- |
| D1 | 模板列表缓存 | `TEMPLATES_LIST_CACHE_REDIS=1` 时走 Redis 缓存和 generation 失效 | `backend/test/templates-list-cache.spec.ts` |
| D2 | OCR Redis 缓存 | Redis 命中优先，本地 LRU 兜底 | `ocr-guardrails.spec.ts` |
| D3 | 文件解析实时态 | Redis 进度覆盖 DB 状态，完成后清理 | `redis-runtime.spec.ts` |
| D4 | AI 流式恢复 | Redis 保存分片，`/ai/streams/:recordId/snapshot` 可读 | `backend/test/redis-runtime.spec.ts`、`backend/test/ai-stream-snapshot.spec.ts` |
| D5 | 轻量队列 | `file-parse`、`ai-analysis`、`ai-generate`、`ai-cross-review` 可入队/出队 | `redis-runtime.spec.ts` |

## 安全测试重点

| 场景 | 验收点 |
| --- | --- |
| 鉴权 | 未登录不能访问受保护接口；JWT 过期后前端跳登录 |
| 权限 | 管理员接口需要角色；用户不能读写他人文件/记录 |
| 文件上传 | 文件大小、类型、空文件、路径穿越、COS URI 处理 |
| 模型配置 | API Key 不回显明文；删除默认模型时自动选择下一个可用模型 |
| CORS/Headers | 生产启用 Helmet；CORS 来源由配置控制 |
| 错误脱敏 | COS、模型供应商、OCR 错误不泄露密钥和内部路径 |
| 依赖审计 | 定期运行 `pnpm audit`，记录升级计划 |

相关测试：

- `backend/test/files.service.security.spec.ts`
- `backend/test/analysis-report-pdf.security.spec.ts`
- `backend/test/ai.service.file-ownership.spec.ts`
- `backend/test/settings-ai-model-delete.spec.ts`

## VPS develop 验收

```bash
cd /Users/lewis/lewis_testcase_platform
git switch develop
git pull --ff-only cnb develop
bash scripts/ops/deploy-develop.sh all
```

部署后检查：

```bash
ssh testcase-server 'docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" | grep testcase_dev'
ssh testcase-server 'curl -fsS http://127.0.0.1:8083/health && echo'
ssh testcase-server 'curl -fsS http://127.0.0.1:3000/health && echo'
curl -fsSI http://139.199.69.115:8083/ai-analysis | head -20
```

Redis 改造相关检查：

```bash
ssh testcase-server 'docker exec testcase_dev_backend sh -lc "env | grep -E \"^(REDIS_URL|TEMPLATES_LIST_CACHE_REDIS|TEMPLATES_LIST_CACHE_TTL_MS)=\" | sort"'
ssh testcase-server 'docker logs --tail=120 testcase_dev_backend 2>&1 | grep -E "Redis|cache/queue/realtime" || true'
```

预期：

- `REDIS_URL=redis://redis:6379`
- `TEMPLATES_LIST_CACHE_REDIS=1`
- `TEMPLATES_LIST_CACHE_TTL_MS=30000`
- 后端日志包含 `Redis: connected; cache/queue/realtime state enabled.`

## main 发布门禁

只有 develop 验证通过后才同步 main：

```bash
git switch main
git pull --ff-only origin main
git merge --ff-only develop
git push origin main
git push cnb main
```

生产部署：

```bash
bash scripts/ops/deploy-main.sh all
curl -fsSI http://139.199.69.115/ai-analysis | head -20
```

## 测试缺口

| 缺口 | 风险 | 建议 |
| --- | --- | --- |
| 真实模型 live 测试默认跳过 | 模型兼容性问题可能只在人工使用时发现 | 增加 `LIVE_AI_SMOKE=1` 夜间或手动触发 |
| 固定流程图 PDF 夹具不足 | PDF 解析质量难量化对比 | 增加脱敏 2-3 页流程图 PDF fixture |
| Redis API 层测试不足 | 已补 `HTTP snapshot` 契约，但真实 Redis + HTTP 联动仍主要靠 smoke | 保留 `LIVE_AI_SMOKE=1` 的 VPS 验证 |
| 依赖审计未纳入固定门禁 | 安全风险延后发现 | 每周运行 `pnpm audit` 并归档 |
| 可观测性不足 | 长任务失败定位依赖日志 | 增加任务状态接口和前端任务面板 |

## 测试报告记录模板

```text
日期：
分支/提交：
执行人：

后端测试：
- pnpm -C backend test：
- pnpm -C backend build：

前端测试：
- pnpm -C frontend test:unit：
- pnpm -C frontend build：
- Playwright E2E：
- Playwright CT：

VPS 验收：
- deploy 脚本：
- /health：
- /api/health：
- /ai-analysis：
- Redis env：

未通过项：
后续处理：
```
