# 系统设置控制台重构设计

## 背景

当前系统设置页承担个人资料、运行环境、多模态、生成默认值、外观天气、AI 模型、超级管理员工具和审计日志。`frontend/src/pages/SettingsPage.tsx` 已超过 1400 行，新增模型、代理、OCR、Redis、队列、Token 等配置时会继续扩大维护成本。

## 目标

将系统设置重构为面向个人提效场景的“设置控制台”，优先解决模型配置、运行态诊断、文件解析/OCR、工作流默认值和管理员工具的可发现性与可维护性。

## 参考方向

- Open WebUI Models：模型可作为 base model 之上的 preset，并绑定 system prompt、tools、knowledge 和 parameters。
- LibreChat custom config：将 custom endpoints、model settings、interface options 放进统一配置体系。
- shadcn-admin：后台设置页适合使用分区导航、表单区和操作区，但本项目应保持更密集、工具化的风格。

## 信息架构

### 1. 控制台总览

第一屏提供可操作的运行态摘要：

- 默认模型、视觉解析模型、启用模型数量、模型连通性最近失败数。
- Redis、流式恢复、文件解析 worker、队列积压、上传上限。
- 快捷操作：刷新运行态、跳转模型中心、跳转文件解析设置。

### 2. AI 模型中心

保留现有增删改查和测试能力，改成更适合排查问题的模型中心：

- Provider 预设：OpenAI Compatible、DeepSeek、Volcengine Ark、Zhipu、Hunyuan、Custom Proxy。
- 模型能力矩阵：Key、启用、默认、视觉、文档视觉解析、最近测试状态、maxTokens、temperature。
- 新增/编辑使用独立面板，不在列表卡片内展开表单。
- 删除、设默认、测试、编辑保持现有后端接口。

### 3. 工作流默认值

将“生成默认参数”升级为工作流默认区：

- 用例生成默认 temperature 和 maxTokens。
- 输出截断策略提示，指向模型 maxTokens 和后续分批生成策略。
- 保存后同步到 `generateStore`。

### 4. 文件解析/OCR 设置

独立展示当前解析链路，不新增写接口：

- PDF 文本层优先、OCR/多模态 fallback 的当前阈值。
- Redis 缓存、文件解析 worker、队列积压、解析超时。
- 解释哪些值来自环境变量，需要 VPS 变量或部署配置修改。

### 5. 个人、外观、管理员、审计

保留现有功能，但拆分为组件：

- ProfileSection
- AppearanceWeatherSection 保持现有实现
- AdminToolsSection
- AuditLogSection

## 前端结构

- `frontend/src/pages/SettingsPage.tsx`：页面状态编排和 section 组合。
- `frontend/src/components/settings/SettingsOverviewSection.tsx`：运行态总览。
- `frontend/src/components/settings/ModelHubSection.tsx`：模型列表、筛选和操作。
- `frontend/src/components/settings/ModelEditorPanel.tsx`：新增/编辑模型面板。
- `frontend/src/components/settings/WorkflowDefaultsSection.tsx`：工作流默认值。
- `frontend/src/components/settings/FileParsingSettingsSection.tsx`：文件解析/OCR 运行态。
- `frontend/src/components/settings/ProfileSection.tsx`：个人资料和密码入口。
- `frontend/src/components/settings/SuperAdminSection.tsx`：用户管理。
- `frontend/src/components/settings/AuditLogSection.tsx`：审计日志。
- `frontend/src/utils/settingsModelPresets.ts`：Provider 预设、模型摘要、诊断文案。

## 后端结构

本轮不新增后端表结构。继续复用：

- `GET /settings/runtime`
- `GET /settings/models`
- `POST /settings/models`
- `PATCH /settings/models/:id`
- `DELETE /settings/models/:id`
- `POST /settings/models/:id/set-default`
- `POST /ai/test-model`

## 交互要求

- 模型新增/编辑面板支持 Provider 预设填充 baseUrl、默认 modelId、maxTokens 和视觉能力。
- 模型中心支持按状态筛选：全部、启用、默认、视觉、失败。
- 模型测试按钮在无 Key 时禁用。
- 删除模型沿用确认弹窗。
- 控制台总览和文件解析设置必须能在无 runtime 数据时显示降级空态。

## 测试策略

- Vitest：
  - Provider 预设填充。
  - 运行态健康摘要。
  - 模型筛选和诊断文案。
- Playwright：
  - `/settings` 展示“设置控制台”、“AI 模型中心”、“文件解析 / OCR”。
  - 管理员可打开新增模型面板，选择 Provider 预设后填充 Base URL。
  - 模型筛选可切换。
  - 运行态和模型列表 mock 数据正常渲染。
- 门禁：
  - `pnpm -C frontend test:unit`
  - `pnpm -C frontend build`
  - `pnpm -C frontend test:e2e -- tests/e2e/settings.spec.ts --project=chromium`
  - Playwright Test Agent 同一批 E2E
  - `pnpm -C backend test`
  - `pnpm -C backend build`

## 非目标

- 不做 Jira/TAPD/飞书真实接入。
- 不做配置版本回滚。
- 不改数据库 schema。
- 不替换全局设计系统。
