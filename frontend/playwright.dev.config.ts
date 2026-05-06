import { defineConfig, devices } from '@playwright/test'

/**
 * 开发环境 E2E：与 `vite` 默认端口一致（5173），便于本地 `pnpm dev` 或 develop 联调后跑同一套用例。
 * 使用：`pnpm test:e2e:dev`（会先尝试启动 dev server，若已在跑则复用）。
 */
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'dot' : 'list',
  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'pnpm dev --host 127.0.0.1 --port 5173',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: true,
    timeout: 120_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
