# 测试建设策略

本文档对应当前测试建设计划的阶段 0、阶段 1、阶段 2，用来固定测试地图、门禁命令和当前缺口。它不替代 [TEST_PLAN.md](/Users/lewis/lewis_testcase_platform/docs/development/TEST_PLAN.md)，而是把“模块 -> 测试文件 -> 缺口”收敛成可执行清单。

## 范围

- 阶段 0：测试基线、命令、模块测试地图
- 阶段 1：后端 P0 接口契约测试，重点覆盖 `auth / files / ai / records / reviews / settings`
- 阶段 2：前端核心组件与状态机测试，重点覆盖 `AI 需求分析 / 生成用例 / 注册登录 / 系统设置`

## 固化命令

### 后端

```bash
pnpm -C backend test
pnpm -C backend build
```

### 前端

```bash
pnpm -C frontend lint
pnpm -C frontend test:unit
pnpm -C frontend build
pnpm -C frontend test:e2e -- tests/e2e/ai-analysis.spec.ts tests/e2e/generate-analysis-handoff.spec.ts tests/e2e/auth-captcha-invite.spec.ts
```

## 模块测试地图

| 模块 | 现有测试文件 | 当前阶段覆盖 | 主要缺口 |
| --- | --- | --- | --- |
| `auth` | `backend/test/auth-captcha-invite.spec.ts`, `backend/test/security-hardening.spec.ts`, `backend/test/http-contract.spec.ts`, `frontend/tests/e2e/auth-captcha-invite.spec.ts` | 注册/登录/验证码/锁定/登出 | 前端 DOM 级交互断言不足，缺少登录页用户视角测试 |
| `files` | `backend/test/files.service.security.spec.ts`, `backend/test/http-contract.spec.ts`, `frontend/tests/e2e/ai-analysis.spec.ts` | MIME、magic number、解析主链路 | 缺少更明确的控制器契约断言与分页/错误响应契约 |
| `ai analyze` | `backend/test/analysis-structured-report.spec.ts`, `backend/test/ai-stream-snapshot.spec.ts`, `backend/test/http-contract.spec.ts`, `frontend/src/features/ai-analysis/analysisPageState.unit.test.ts`, `frontend/tests/e2e/ai-analysis.spec.ts` | 流式恢复、结构化报告、基础状态机 | 缺少 DOM 级运行态组件测试 |
| `ai generate` | `backend/test/ai-output-schema.spec.ts`, `backend/test/ai-output-quality.spec.ts`, `frontend/src/features/generate/generatePageUtils.unit.test.ts`, `frontend/tests/e2e/generate-analysis-handoff.spec.ts` | schema、质量修复、分析联动 E2E | 缺少用户视角的范围选择/覆盖驾驶舱 DOM 测试 |
| `records` | `backend/test/http-contract.spec.ts` | 基础 HTTP 契约 | 缺少 Supertest 级鉴权、分页、DTO whitelist 测试 |
| `reviews` | `backend/test/reviews-execution-results.spec.ts` | 执行结果回写 | 缺少控制器契约、批量状态、编辑 DTO 校验测试 |
| `settings` | `backend/test/settings-admin-audit.spec.ts`, `backend/test/settings-ai-model-delete.spec.ts`, `frontend/tests/e2e/settings.spec.ts` | 审计日志、模型删除、E2E 基础流程 | 缺少 DOM 级导航测试和控制器角色/DTO 契约测试 |

## 阶段 0 输出

- [x] 固化命令
- [x] 建立模块测试地图
- [x] 建立缺口矩阵
- [ ] 将 lint/typecheck 进一步提升为 CI 强制门禁

## 阶段 1 目标

后端接口契约测试统一使用 `Nest TestingModule + Supertest`，重点断言：

- HTTP status 不再模糊
- 响应体 envelope：`{ code, message, data, timestamp }`
- `ValidationPipe whitelist / forbidNonWhitelisted`
- 鉴权与角色权限
- 分页/筛选参数透传
- 错误码与错误消息

## 阶段 2 目标

前端优先做“稳定的小组件”和“状态驱动区域”的 DOM 测试：

- `AI 需求分析`
  - 步骤条状态
  - 运行态阶段轨道
  - 指标卡渲染
- `生成用例`
  - REQ/TP 范围勾选
  - 覆盖驾驶舱的结果展示
- `注册登录`
  - 登录/注册视图切换
  - 密码强度实时反馈
  - 注册发送验证码后进入邮箱验证码阶段
- `系统设置`
  - 导航只展示可见分区
  - 按钮/下拉切换触发 section 选择

## 当前高风险缺口

1. `records/reviews/settings` 之前缺少统一的 Supertest 契约层，接口安全网不完整。
2. 前端大页虽然有 E2E，但 DOM 层可回归测试不足，很多交互只能靠端到端发现。
3. `generate` 页的覆盖范围和结果驾驶舱缺少直接测试，后续 UI 调整容易回归。
4. `LoginPage` 是登录/注册/验证码三态合页，之前没有页面级 DOM 测试。

## 交付标准

- 阶段 0：`docs/qa/TEST_STRATEGY.md` 完成
- 阶段 1：新增后端 Supertest 契约测试并通过
- 阶段 2：新增前端 DOM 测试并通过
- 统一门禁：
  - `pnpm -C backend test`
  - `pnpm -C backend build`
  - `pnpm -C frontend lint`
  - `pnpm -C frontend test:unit`
  - `pnpm -C frontend build`
  - `pnpm -C frontend test:e2e -- tests/e2e/ai-analysis.spec.ts tests/e2e/generate-analysis-handoff.spec.ts tests/e2e/auth-captcha-invite.spec.ts`
