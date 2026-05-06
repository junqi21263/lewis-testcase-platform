/**
 * Run local Playwright CLI with a sanitized environment so IDE/sandbox injections
 * of PLAYWRIGHT_BROWSERS_PATH do not hide already-installed Chromium / headless shell.
 */
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const exe = process.platform === 'win32' ? 'playwright.cmd' : 'playwright'
const bin = path.join(root, 'node_modules', '.bin', exe)

const env = { ...process.env }
delete env.PLAYWRIGHT_BROWSERS_PATH // <--- Key change here

// Use the installed Playwright browsers path from node_modules
const pwPkgPath = path.join(root, 'node_modules', '@playwright', 'test', 'package.json')
try {
  const pwPkg = JSON.parse(require('fs').readFileSync(pwPkgPath, 'utf8'))
  const browsersPath = path.join(root, 'node_modules', '.playwright')
  env.PLAYWRIGHT_BROWSERS_PATH = browsersPath
} catch {
  // Fallback: use default
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
