/**
 * 自测：注册 → 查库 → 登录
 *
 * 前置：
 * 1. pnpm exec prisma generate --schema=./prisma/schema.prod.prisma
 * 2. 后端已启动且 DATABASE_URL 与本脚本读取的 .env 一致（与 API 连同一数据库）
 * 3. 可选环境变量 VERIFY_API_URL，默认 http://127.0.0.1:3000/api
 *
 * 运行：pnpm run verify:auth-flow
 */
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { PrismaClient } from '@prisma/client'

function loadEnvFile(p: string) {
  if (!existsSync(p)) return
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const i = t.indexOf('=')
    if (i === -1) continue
    const k = t.slice(0, i).trim()
    let v = t.slice(i + 1).trim()
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1)
    }
    if (process.env[k] === undefined) process.env[k] = v
  }
}

async function main() {
  loadEnvFile(join(__dirname, '..', '.env'))

  if (!process.env.DATABASE_URL?.trim()) {
    console.error('缺少 DATABASE_URL（请在 backend/.env 中配置）')
    process.exit(1)
  }

  const apiBase = (process.env.VERIFY_API_URL || 'http://127.0.0.1:3000/api').replace(
    /\/$/,
    '',
  )
  const prisma = new PrismaClient()
  const stamp = Date.now()
  const email = `verify_${stamp}@example.com`
  const username = `u_${stamp}`
  const password = 'Test@123456'

  try {
    let regRes: Response
    try {
      regRes = await fetch(`${apiBase}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, username, password }),
      })
    } catch (e: unknown) {
      const err = e as { cause?: { code?: string } }
      if (err?.cause?.code === 'ECONNREFUSED') {
        console.error(
          '无法连接 API（请在本机启动后端，或设置 VERIFY_API_URL 指向可访问的 /api 根地址）',
        )
      }
      throw e
    }

    let regBody: {
      code?: number
      message?: string
      data?: { accessToken?: string; user?: { id: string } }
    }
    try {
      regBody = (await regRes.json()) as typeof regBody
    } catch {
      console.error('注册失败', regRes.status, '(非 JSON 响应)')
      process.exit(1)
    }

    if (regBody.code !== 0) {
      console.error('注册失败', regRes.status, regBody.message || regBody)
      process.exit(1)
    }

    const row = await prisma.user.findUnique({ where: { email } })
    if (!row) {
      console.error('FAIL: 注册接口成功但 users 表中无该邮箱记录（请确认 API 与脚本使用同一 DATABASE_URL）')
      process.exit(1)
    }
    console.log('OK: 已写入 users 表', {
      id: row.id,
      email: row.email,
      username: row.username,
    })

    const loginRes = await fetch(`${apiBase}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    })
    const loginBody = (await loginRes.json()) as {
      code?: number
      message?: string
      data?: { accessToken?: string }
    }

    if (loginBody.code !== 0 || !loginBody.data?.accessToken) {
      console.error('登录失败', loginRes.status, loginBody.message || loginBody)
      process.exit(1)
    }

    console.log('OK: 登录成功，已拿到 accessToken')
    console.log('自测通过：注册写库 + 登录校验一致')
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
