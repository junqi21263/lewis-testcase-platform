# 版本里程碑（存档）

> 日常变更以 `CHANGELOG.md` 与 Git 提交为准。本文保留较细的里程碑叙述，便于回顾。

## 如何补充

合并进主分支或发布前，可在**文末**追加 `### YYYY-MM-DD（标题）` 小节：用户可见变更、运维/迁移步骤、安全相关（勿写真实密钥）。

---

### 2026-04-13（鉴权与 API 报文对齐）

- **API 响应约定统一**
  - 业务接口语义错误通过 JSON 的 `code` 表达（成功 `code: 0`），并在前端 axios 层统一拦截提示
  - 裸路由 `GET /health` 保持纯文本 `ok`（200），用于平台健康检查
- **注册/登录与安全性**
  - 登录/注册失败提示与后端校验一致，减少“前端放行但后端 400”的摩擦
  - 忘记密码返回统一说明，降低邮箱枚举风险

### 2026-04-10 ~ 2026-04-23（能力建设：认证、邮件、解析、记录体系）

- **认证与权限体系成型**
  - 引入 `UserRole`（SUPER_ADMIN / ADMIN / MEMBER / VIEWER）与全局 RolesGuard
  - 团队/成员能力逐步完善（团队成员角色、团队范围数据可见性）
- **邮件能力与注册/找回闭环**
  - 邮箱验证码注册与重置密码（OTP/挑战表），并对失败场景做“安全提示 + 不暴露用户是否存在”
  - 邮件发送适配多种服务商（以环境变量注入为主），并提供连通性自检脚本
- **文件上传与解析能力增强**
  - 支持更大文件与更稳健的上传链路（分片上传/合并、失败诊断）
  - 文档解析与结构化快照（便于后续“从解析结果带入生成”）
  - OCR/多语言与解析失败兜底策略逐步完善（超时/卡住任务可恢复）
- **生成与记录体系**
  - 生成记录列表/详情、过滤、批量操作、回收站（软删除）等基础能力打通
  - 结果页/导出能力迭代：从“仅展示”到“可导出、可复用、可回溯”
- **模板体系**
  - 模板可复制编辑、与生成关联 templateId、usageCount 统计，支持内置专业模板

### 2026-04-24 ~ 2026-04-26（部署稳定性与生产化打磨）

- **容器启动稳定性**
  - 启动阶段迁移与健康检查路径调整，降低 502/超时误判
  - 关键依赖在 Docker/Alpine 下的构建稳定性修复（如 canvas/pdf 渲染相关依赖）
- **解析 Worker 稳定性**
  - 解析任务从“易受实例影响”逐步收敛到“DB 驱动 + 可恢复”的 worker 模式
  - 卡住的 PARSING 状态可通过超时标记失败并引导重试
- **CORS 与前后端联调优化**
  - Origin 归一化、错误提示更可诊断
  - 生产环境建议前端走同源 `/api` 反向代理，避免跨域复杂度

### 2026-04-24 ~ 2026-04-27（自托管/部署与体验增强）

- **VPS 自动部署闭环（GitHub Actions → SSH → rsync → compose）**
  - `.github/workflows/deploy-vps.yml`：Runner `checkout` 后 `rsync` 到服务器，避免服务器端 `git clone` 受网络影响
  - 部署后运行 `scripts/smoke.sh` 做最小可用性验证
- **生产 Compose 硬化**
  - `docker-compose.full.yml`：前端 Nginx + 后端 + Postgres + Redis 全量栈
  - 默认不对公网暴露 Postgres/Redis；可选仅绑定 `127.0.0.1:5432` 便于 Navicat/SSH 隧道连接“与后端同库”
  - 生产配置参数化（JWT/CORS/模型 BaseURL 等）
- **登录失败/密码问题“底层修复”**
  - 登录支持“用户名或邮箱”
  - 增加 `AUTH_ALLOW_PLAINTEXT_PASSWORD` 应急救援：允许明文比对并在成功后自动升级为 bcrypt（仅救援脏数据，建议关闭）
  - `users.username` 唯一约束迁移：自动处理历史重复用户名，避免登录匹配不确定
- **可观测性与运维体验**
  - Dashboard 增加运行状态（后端健康 + 解析队列状态）
  - 系统设置增加“模型连通性测试”（管理员）与“超级管理员工具”（用户查询/重置密码/改角色）
- **生成效率与交付体验**
  - 最近模板快捷入口、模板“去生成”带入、复用记录自动带入原文件
  - 生成完成页新增：查看记录 / 分享链接 / 导出（Excel/Markdown/JSON）/ 复制 JSON（无 suiteId 自动降级前端导出）

### 2026-04-27（本轮迭代明细）

本次迭代聚焦“部署稳定性 + 生成效率 + 结果交付体验 + 运维能力”。

- **部署与可观测性**
  - 新增/完善 VPS 自动部署工作流：Runner 拉取代码后 rsync 到服务器，再 `docker compose up -d --build`
  - 部署后自动执行 `scripts/smoke.sh` 验证 `/api/health`
  - `docker-compose.full.yml` 默认不对公网暴露 Postgres/Redis；Postgres 可选仅绑定 `127.0.0.1:5432` 便于 SSH 隧道工具连接

- **登录/鉴权与数据一致性**
  - 登录支持“用户名或邮箱”
  - 增加明文密码应急开关 `AUTH_ALLOW_PLAINTEXT_PASSWORD`：登录成功后自动升级为 bcrypt（仅用于救援历史脏数据）
  - 生产 Prisma schema 强化 `users.username` 唯一约束并提供迁移（避免重复用户名导致登录不确定）

- **生成效率**
  - 生成页新增“最近模板”快捷入口（本地持久化）
  - 记录复用到生成时，若原记录关联文件，自动带入文件以免重复上传

- **生成结果交付体验**
  - 生成完成页提供：查看记录 / 分享链接 / 导出（Excel/Markdown/JSON）/ 复制 JSON
  - 导出优先走后端 suite 导出，失败或缺少 suiteId 时自动降级为前端导出

- **管理员运维**
  - 新增 `SUPER_ADMIN` 用户运维能力：查询用户、重置密码、修改角色（前端设置页提供操作面板）

> 注：上面的“本轮迭代明细”是对关键提交的归纳，便于快速验收与回归测试。

### 2026-04-28（超级管理员运维审计）

- **审计表与 API**
  - 新增数据库表 `admin_audit_logs`（随生产迁移发布；不存储明文密码）
  - 超管 **重置密码**、**修改角色** 时写入审计；提供 `GET /api/admin/audit-logs` 供超管拉取近期记录
- **前端**
  - 系统设置 → 在「超级管理员工具」下增加 **「运维审计日志」** 只读列表，并支持手动刷新
- **自测建议**
  - 以 `SUPER_ADMIN` 登录后，在设置页完成一次改角色或重置密码，应能在审计区看到对应操作类型（**不**应出现密码内容）

### 2026-04-29（测试用例 Excel / 降级导出对齐）

- **后端 Excel（权威）**
  - `GET /api/testcases/suites/:id/export?format=EXCEL`：表头顺序固定为  
    **用例名称 → 所属模块 → 标签 → 前置条件 → 步骤描述 → 预期结果 → 编辑模式 → 备注 → 用例等级**
  - 「所属模块」优先取用例集的 `projectName`，否则用用例集名称
  - 「编辑模式」由用例 `status` 映射为草稿/评审中/已通过/已归档
  - 文件名：**`YYYYMMDD_HHmm.xlsx`**（示例：`20260428_0951.xlsx`）
- **前端（降级 CSV / 文件名）**
  - 浏览器端 CSV 列顺序与含义与上表一致；必要时请求用例集信息补全「所属模块」
  - 降级导出的 JSON/Markdown/CSV 文件名中的时间戳格式与后端 Excel 保持一致（`YYYYMMDD_HHmm`）
  - 无服务端 `suiteId` 时点击 **Excel** 会提示改从「生成记录」导出或确认已落地用例集（Excel 依赖后端生成文件流）
- **联调自检**
  - 有一条已关联 `suiteId` 的生成记录时：在记录详情或生成页导出 Excel，打开表格核对表头顺序与文件名格式
  - 去掉 `suiteId` 场景（仅前端内存用例）：导出 CSV，核对列与 Excel 约定一致

### 2026-04-28（文档）联调对齐、门禁脚本与部署路径

- **文档**
  - 「初始化数据库」与生产一致：使用 **`prisma/schema.prod.prisma`** 执行 `migrate deploy` / `generate`。
  - 本地前后端对齐：Nest `globalPrefix`、`/health` 与 `/api/health`、前端 `VITE_API_BASE_URL` 与 Vite `/api` 代理。
- **门禁脚本**：`scripts/dev-integration-check.sh` — `prisma validate` / `generate`（`schema.prod.prisma`）与前后端 **`pnpm build`**。
- **推送与部署（摘要）**
  1. 可选：`bash scripts/dev-integration-check.sh`
  2. `git push origin main`
  3. 云服务器：`docker compose -f docker-compose.full.yml up -d --build`，再 **`bash scripts/smoke.sh`**；若启用 GitHub Actions，推送 `main` 会自动 rsync 并 compose。

### 2026-04-28（云服务器为默认生产部署）

- 生产默认路径：**自有云服务器 + `docker-compose.full.yml`**。
- **`docker-compose.full.env.example`**：全栈 **`.env`** 模板。
- **Nginx**：`nginx.conf.template` 增加 **`/health`** 反代至后端裸探活。

### 2026-04-29（当日部署、更新与修改）

- **联调与契约对齐**
  - 后端：`backend/scripts/smoke-enhancements.ts` 统一按 `{ code, data }` 解包。
  - 前端：`frontend/package.json` 增加 `integrate:smoke`。
- **UI/UX 修复与一致性**
  - 侧边栏、动态壁纸与暗色风格优化。
- **测试体系升级**
  - Playwright CT、Vitest、Allure：`pnpm allure:report`。
- **Playwright Agents / MCP**
  - `planner / generator / healer` 代理定义；Cursor 推荐 `npx @playwright/mcp@latest`。

### 2026-04-29（文档脱敏与泄漏防护）

- CI/部署示例使用占位符（`<DEPLOY_SSH_HOST>`、`<DEPLOY_PATH>` 等）。
- 避免在文档中出现可直接复用的真实基础设施标识。
