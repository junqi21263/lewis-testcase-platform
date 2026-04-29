import { defineConfig, devices } from '@playwright/experimental-ct-react'
import { fileURLToPath } from 'url'
import path from 'path'
import fs from 'fs'
import react from '@vitejs/plugin-react'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export default defineConfig({
  testDir: './src/__tests__/ct',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'dot' : 'list',
  use: {
    viewport: { width: 1100, height: 720 },
    ctViteConfig: {
      plugins: [react()],
      resolve: {
        alias: {
          '@': path.resolve(__dirname, './src'),
        },
      },
      // CT 的 Vite root 在 playwright/，默认找不到上级 postcss.config.js，会导致 Tailwind 未处理、页面脚本异常
      css: {
        postcss: path.resolve(__dirname, './postcss.config.js'),
      },
    },
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Prefer Playwright-managed browser for CT stability.
        // If you want to override, set PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH.
        launchOptions: (() => {
          const p = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?.trim()
          if (p) {
            if (fs.existsSync(p)) return { executablePath: p }
            // eslint-disable-next-line no-console
            console.warn(`[ct] PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH not found, fallback to bundled Chromium: ${p}`)
          }
          return {}
        })(),
      },
    },
  ],
})

