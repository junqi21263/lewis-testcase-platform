# 安全与质量检查摘要（2026-05-09）

本文档记录当次自动化检查结论；**HTML Allure 报告**需在本地生成（见文末），不纳入 Git。

## 1. 依赖漏洞（pnpm audit）

| 范围 | 结果 | 说明 |
|------|------|------|
| **backend** | 约 18 条（7 moderate / 11 high） | 多项来自 `@nestjs/core` 等传递依赖；官方修复版本在 Nest 11.1.18+，升级主版本需单独规划。此前已用 overrides（xlsx 官方包、request/tough-cookie、fast-xml-parser、webpack、uuid、lodash 等）压低部分传递风险。 |
| **frontend** | 2 moderate | `vite@5.x` / `esbuild` 开发链相关（GHSA-4w7w-66w2-5vf9、GHSA-67mh-4wv8-2f99）；审计建议的修复多在 Vite 6.x，升级需评估构建兼容性。`postcss` 已通过 override 升至 8.5.14。 |

## 2. 敏感信息暴露（静态检查）

- **已消除**：`backend/scripts/verify-auth-flow.ts` 中硬编码测试口令；现要求环境变量 **`VERIFY_AUTH_TEST_PASSWORD`**（勿写入仓库）。
- **建议**：继续避免在示例 `.env`、compose 与脚本中提交真实密钥；生产凭据仅放密钥管理 / 部署环境。
- **扫描提示**：仓库内 E2E 使用 `mock-token` 等为**测试桩**，不视为生产泄露。

## 3. 功能测试（Playwright + Vitest）

在官方镜像 `mcr.microsoft.com/playwright:v1.59.1-jammy` 中执行：

```bash
cd frontend
pnpm allure:report
```

当次结果：

- **Vitest**：5 files，14 tests，全部通过。
- **Playwright CT**：10 tests，全部通过。
- **Playwright E2E**：6 tests，全部通过（页面路由级请求已 mock；Vite 对 `/api/*` 代理至 `127.0.0.1:3000` 时无后端会打印 `ECONNREFUSED`，**不影响**当前用例断言）。

## 4. Allure 报告

1. 安装 JRE（若本机无 Java）：例如 `openjdk-11-jre-headless`。
2. 在 `frontend/` 执行：`pnpm allure:report`（会先 `test:pw:install` 再跑单测、CT、E2E 并生成报告）。
3. 打开：`frontend/allure-report/index.html`（或脚本输出的 `file://` 链接）。

`allure-results/` 与 `allure-report/` 在 `.gitignore` 中，请勿提交二进制报告目录。

## 5. 本次对工具链的改动要点

- **`pnpm allure:report`**：纳入 E2E，并与 `test:pw:install` 串联，保证浏览器版本与 `@playwright/test` 一致。
- **`scripts/run-playwright.mjs`**：默认清除被注入的 `PLAYWRIGHT_BROWSERS_PATH`；仅在 `PW_LOCAL_PLAYWRIGHT_PATH=1` 时使用 `node_modules/.playwright`，兼容 Docker 与 CI。

## 6. 残留风险与后续建议

- 将 **Nest 大版本升级** 纳入排期以收敛 `@nestjs/core` 相关 advisory。
- 评估 **Vite 6** 升级路径，处理 dev-server 相关 moderate 告警。
- 若需「无 ECONNREFUSED 日志」的 E2E，可为 Vite 在测试环境关闭对后端的 proxy，或为 `/api/preferences` 等增加路由级 mock。
