import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { PrismaClient, UserRole } from '@prisma/client'
import bcrypt from 'bcryptjs'

function loadEnvFile(p: string) {
  if (!existsSync(p)) return
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const i = t.indexOf('=')
    if (i === -1) continue
    const k = t.slice(0, i).trim()
    let v = t.slice(i + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1)
    }
    if (process.env[k] === undefined) process.env[k] = v
  }
}

function requireE2eWrite() {
  if (process.env.E2E_DB_WRITE === '1') return
  throw new Error('Refusing to write test credentials: set E2E_DB_WRITE=1 for a non-production test database')
}

function resolveRole(raw: string | undefined): UserRole {
  const value = (raw || 'MEMBER').trim()
  if (value in UserRole) return value as UserRole
  throw new Error(`Invalid E2E_LOGIN_ROLE: ${value}`)
}

async function main() {
  loadEnvFile(join(__dirname, '..', '.env'))
  if (!process.env.DATABASE_URL?.trim()) {
    throw new Error('Missing DATABASE_URL for E2E credential setup')
  }
  requireE2eWrite()

  const email = (process.env.E2E_LOGIN_EMAIL || 'e2e-live-login@example.com').trim().toLowerCase()
  const username = (process.env.E2E_LOGIN_USERNAME || 'e2e_live_login').trim()
  const role = resolveRole(process.env.E2E_LOGIN_ROLE)
  const password = `E2e_${randomBytes(18).toString('base64url')}aA1!`
  const hash = await bcrypt.hash(password, 10)

  const prisma = new PrismaClient()
  try {
    const usernameOwner = await prisma.user.findFirst({
      where: { username, email: { not: email } },
      select: { id: true, email: true },
    })
    if (usernameOwner) {
      throw new Error(`E2E_LOGIN_USERNAME is already used by another account: ${username}`)
    }

    const user = await prisma.user.upsert({
      where: { email },
      update: {
        username,
        password: hash,
        role,
        emailVerified: true,
      },
      create: {
        email,
        username,
        password: hash,
        role,
        emailVerified: true,
      },
      select: {
        id: true,
        email: true,
        username: true,
        role: true,
      },
    })

    process.stdout.write(
      JSON.stringify({
        login: user.email,
        password,
        userId: user.id,
        username: user.username,
        role: user.role,
      }),
    )
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((e) => {
  console.error('[e2e-ensure-login-user] failed:', e instanceof Error ? e.message : e)
  process.exit(1)
})
