import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export type LiveLoginCredentials = {
  login: string
  password: string
  userId: string
  username: string
  role: string
}

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const frontendRoot = path.resolve(__dirname, '../../..')
const backendRoot = path.resolve(frontendRoot, '../backend')

export function getLiveLoginCredentials(): LiveLoginCredentials {
  const stdout = execFileSync(
    'pnpm',
    ['-C', backendRoot, 'exec', 'ts-node', 'scripts/e2e-ensure-login-user.ts'],
    {
      encoding: 'utf8',
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  ).trim()
  return JSON.parse(stdout) as LiveLoginCredentials
}
