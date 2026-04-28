import { defineConfig, devices } from '@playwright/experimental-ct-react'
import { fileURLToPath } from 'url'
import path from 'path'
import fs from 'fs'

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
      resolve: {
        alias: {
          '@': path.resolve(__dirname, './src'),
        },
      },
    },
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Prefer local browser to avoid large downloads in restricted networks.
        // Playwright expects executablePath/channel under launchOptions.
        launchOptions: (() => {
          const p = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?.trim()
          if (p) {
            if (fs.existsSync(p)) return { executablePath: p }
            // eslint-disable-next-line no-console
            console.warn(
              `[ct] PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH not found, fallback to channel=chrome: ${p}`,
            )
          }
          return { channel: 'chrome' }
        })(),
      },
    },
  ],
})

