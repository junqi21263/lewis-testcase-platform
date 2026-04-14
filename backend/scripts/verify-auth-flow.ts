/**
 * 自测：注册（验证码）→ 确认建号 → 登录
 *
 * 前置：
 * 1. pnpm exec prisma generate --schema=./prisma/schema.prod.prisma
 * 2. 后端已启动且 DATABASE_URL 与本脚本读取的 .env 一致（与 API 连同一数据库）
 * 3. 可选环境变量 VERIFY_API_URL，默认 http://127.0.0.1:3000/api
 *
 * 说明：发送验证码后真实 OTP 在邮件或 dev 日志中；脚本通过 Prisma 将验证码行改为已知值以完成自动化。
 *
 * 运行：pnpm run verify:auth-flow
 */
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import * as bcrypt from 'bcryptjs'
import { PrismaClient, EmailOtpPurpose } from '@prisma/client'

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
  const knownCode = '424242'

  try {
    let sendRes: Response
    try {
      sendRes = await fetch(`${apiBase}/auth/register/send-code`, {
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

    let sendBody: { code?: number; message?: string; data?: { email?: string } }
    try {
      sendBody = (await sendRes.json()) as typeof sendBody
    } catch {
      console.error('发送验证码失败', sendRes.status, '(非 JSON 响应)')
      process.exit(1)
    }

    if (sendBody.code !== 0) {
      console.error('发送验证码失败', sendRes.status, sendBody.message || sendBody)
      process.exit(1)
    }

    const rowBefore = await prisma.user.findUnique({ where: { email } })
    if (rowBefore) {
      console.error('FAIL: 发送验证码后 users 表不应已有该邮箱（请确认 OTP 注册流程）')
      process.exit(1)
    }

    const challenge = await prisma.emailOtpChallenge.findUnique({
      where: { email_purpose: { email, purpose: EmailOtpPurpose.REGISTER } },
    })
    if (!challenge) {
      console.error('FAIL: email_otp_challenges 中无 REGISTER 记录')
      process.exit(1)
    }

    await prisma.emailOtpChallenge.update({
      where: { email_purpose: { email, purpose: EmailOtpPurpose.REGISTER } },
      data: { codeHash: await bcrypt.hash(knownCode, 10) },
    })

    const confirmRes = await fetch(`${apiBase}/auth/register/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, code: knownCode }),
    })
    const confirmBody = (await confirmRes.json()) as {
      code?: number
      message?: string
      data?: { accessToken?: string; user?: { id: string; emailVerified?: boolean } }
    }

    if (confirmBody.code !== 0 || !confirmBody.data?.user?.id) {
      console.error('确认注册失败', confirmRes.status, confirmBody.message || confirmBody)
      process.exit(1)
    }

    if (!confirmBody.data.accessToken) {
      console.error('FAIL: 确认注册应返回 accessToken')
      process.exit(1)
    }

    const row = await prisma.user.findUnique({ where: { email } })
    if (!row) {
      console.error('FAIL: 确认后 users 表应存在该邮箱')
      process.exit(1)
    }
    if (!row.emailVerified) {
      console.error('FAIL: 预期 emailVerified 为 true')
      process.exit(1)
    }

    console.log('OK: 验证码流程建号', {
      id: row.id,
      email: row.email,
      username: row.username,
      emailVerified: row.emailVerified,
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
    console.log('自测通过：OTP 注册确认写库 + 登录一致')
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
