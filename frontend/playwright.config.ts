import { defineConfig, devices } from '@playwright/test'

const localNoProxy = ['127.0.0.1', 'localhost', '::1']
process.env.NO_PROXY = Array.from(
  new Set([...localNoProxy, ...(process.env.NO_PROXY ?? '').split(',').filter(Boolean)]),
).join(',')
process.env.no_proxy = process.env.NO_PROXY

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: [
    [process.env.CI ? 'dot' : 'list'],
    [
      'allure-playwright',
      {
        outputFolder: 'allure-results',
        detail: true,
      },
    ],
  ],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    launchOptions: {
      args: ['--no-proxy-server'],
    },
  },
  webServer: {
    command: 'pnpm dev --host 127.0.0.1 --port 4173',
    url: 'http://127.0.0.1:4173',
    env: {
      NO_PROXY: process.env.NO_PROXY,
      no_proxy: process.env.NO_PROXY,
    },
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
