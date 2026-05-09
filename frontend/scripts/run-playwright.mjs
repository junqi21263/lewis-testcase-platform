/**
 * Run local Playwright CLI with a sanitized environment so IDE/sandbox injections
 * of PLAYWRIGHT_BROWSERS_PATH do not hide already-installed Chromium / headless shell.
 *
 * By default we only *remove* PLAYWRIGHT_BROWSERS_PATH so `pnpm exec playwright install`
 * (or official Playwright Docker images + install) control browser location.
 *
 * To force `node_modules/.playwright` (legacy local layout), set PW_LOCAL_PLAYWRIGHT_PATH=1.
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const exe = process.platform === 'win32' ? 'playwright.cmd' : 'playwright'
const bin = path.join(root, 'node_modules', '.bin', exe)

const env = { ...process.env }
delete env.PLAYWRIGHT_BROWSERS_PATH

if (process.env.PW_LOCAL_PLAYWRIGHT_PATH === '1') {
  const bundled = path.join(root, 'node_modules', '.playwright')
  if (fs.existsSync(bundled)) {
    env.PLAYWRIGHT_BROWSERS_PATH = bundled
  }
}

const child = spawn(bin, process.argv.slice(2), {
  cwd: root,
  stdio: 'inherit',
  env,
  shell: false,
})

child.on('error', (err) => {
  console.error('[run-playwright]', err.message)
  process.exit(1)
})

child.on('exit', (code, signal) => {
  process.exit(signal ? 1 : code ?? 0)
})
