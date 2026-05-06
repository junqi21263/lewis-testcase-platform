# Specs

This is a directory for test plans.

## Cursor / VS Code：Playwright MCP

`pnpm exec playwright init-agents --loop=vscode` 生成的 `run-test-mcp-server` 在当前 Playwright **1.59.x** CLI 里**尚不存在**，会出现 `unknown command 'run-test-mcp-server'`。

在 Cursor 里请改用官方 **浏览器 MCP**（与 [Playwright MCP 文档](https://playwright.dev/docs/getting-started-mcp) 一致）：

- 参考仓库内 **`frontend/config/mcp-playwright-cursor.json`**，将内容合并到 **Cursor Settings → MCP**。
- VS Code 可对照 **`frontend/config/mcp-playwright-vscode.json`** 写入 `.vscode/mcp.json`。

`.github/agents/` 里面向 **GitHub Copilot** 的 Test Agents（planner / generator / healer）依赖未来的 **Test MCP**；日常在 Cursor 里控浏览器、写用例，用 `@playwright/mcp` 即可。

## 开发环境（develop / 本地 dev）自测

**自动化门禁（推荐每次推 `develop` 前跑）：**

```bash
cd frontend
pnpm run test:pw:dev
```

说明：`test:pw:dev` = Vitest 单元 + Playwright CT + **E2E（`playwright.dev.config.ts`，默认 `http://127.0.0.1:5173`）**。若本机已在 `pnpm dev`，会复用现有 dev server。

**Cursor 里用 Playwright MCP 做「Agent 式」探索（补自动化盲区）：**

1. 将 `frontend/config/mcp-playwright-cursor.json` 合并进 Cursor MCP 配置。
2. 本地先起前后端（或至少前端 `pnpm dev`），在对话里让 Agent 打开站点并按场景点击、截图、记录问题。
3. 发现的缺陷可再落成 `tests/e2e/*.spec.ts` 或 CT 用例，纳入 `pnpm test:pw:dev`。
