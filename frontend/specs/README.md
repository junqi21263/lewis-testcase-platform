# Specs

This is a directory for test plans.

## Cursor / VS Code：Playwright MCP

`pnpm exec playwright init-agents --loop=vscode` 生成的 `run-test-mcp-server` 在当前 Playwright **1.59.x** CLI 里**尚不存在**，会出现 `unknown command 'run-test-mcp-server'`。

在 Cursor 里请改用官方 **浏览器 MCP**（与 [Playwright MCP 文档](https://playwright.dev/docs/getting-started-mcp) 一致）：

- 参考仓库内 **`frontend/config/mcp-playwright-cursor.json`**，将内容合并到 **Cursor Settings → MCP**。
- VS Code 可对照 **`frontend/config/mcp-playwright-vscode.json`** 写入 `.vscode/mcp.json`。

`.github/agents/` 里面向 **GitHub Copilot** 的 Test Agents（planner / generator / healer）依赖未来的 **Test MCP**；日常在 Cursor 里控浏览器、写用例，用 `@playwright/mcp` 即可。
