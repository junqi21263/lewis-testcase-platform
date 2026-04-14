/**
 * 自检 SMTP：与 MailService 相同的 MAIL_* / SMTP_* 规则，发一封测试信。
 *
 * 收件人：TEST_MAIL_TO，否则为 MAIL_USERNAME / SMTP_USER（发给自己）
 *
 * 运行：pnpm run test:smtp
 */
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import * as dns from 'node:dns'
import * as nodemailer from 'nodemailer'

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

function env(key: string): string {
  const raw = process.env[key]
  return raw != null && String(raw).trim() !== '' ? String(raw).trim() : ''
}

function smtpHost() {
  return env('MAIL_HOST') || env('SMTP_HOST')
}
function smtpPort() {
  const p = env('MAIL_PORT') || env('SMTP_PORT') || '587'
  return parseInt(p, 10) || 587
}
function smtpUser() {
  return env('MAIL_USERNAME') || env('SMTP_USER')
}
function smtpPass() {
  return env('MAIL_PASSWORD') || env('SMTP_PASS')
}
function smtpSecure(): boolean {
  const legacy = env('SMTP_SECURE').toLowerCase() === 'true'
  const enc = env('MAIL_ENCRYPTION').toLowerCase()
  if (enc === 'ssl') return true
  if (enc === 'tls') return false
  return legacy
}
function buildFrom(): string {
  const nameRaw = env('MAIL_FROM_NAME')
  const addr = env('MAIL_FROM_ADDRESS')
  const legacy = env('SMTP_FROM')
  if (nameRaw.includes('<') && nameRaw.includes('>')) {
    return nameRaw
  }
  if (addr && nameRaw) {
    return `${nameRaw} <${addr}>`
  }
  if (addr) return addr
  if (legacy) return legacy
  return smtpUser() || 'no-reply@example.com'
}

function applyIpv4FirstDns() {
  const v = env('MAIL_SMTP_IPV4FIRST').toLowerCase()
  if (v === '0' || v === 'false' || v === 'no') return
  if (typeof dns.setDefaultResultOrder !== 'function') return
  dns.setDefaultResultOrder('ipv4first')
  console.log('DNS: 已 setDefaultResultOrder("ipv4first")（与 MailService 一致，缓解 ENETUNREACH IPv6）')
}

async function main() {
  loadEnvFile(join(__dirname, '..', '.env'))
  applyIpv4FirstDns()

  const host = smtpHost()
  const port = smtpPort()
  const user = smtpUser()
  const pass = smtpPass()
  const issues: string[] = []
  if (!host) issues.push('未设置 MAIL_HOST 或 SMTP_HOST')
  if (!user) issues.push('未设置 MAIL_USERNAME 或 SMTP_USER')
  if (!pass) issues.push('未设置 MAIL_PASSWORD 或 SMTP_PASS')
  if (issues.length) {
    console.error('SMTP 未就绪:', issues.join('；'))
    process.exit(1)
  }

  let secure = smtpSecure()
  const enc = env('MAIL_ENCRYPTION').toLowerCase()
  const hasLegacySecure = env('SMTP_SECURE') !== ''
  if (!enc && !hasLegacySecure && port === 465) {
    secure = true
  }

  const to = env('TEST_MAIL_TO') || user
  const from = buildFrom()
  const connectionTimeout = parseInt(env('SMTP_CONNECTION_TIMEOUT_MS') || '15000', 10)
  const socketTimeout = parseInt(env('SMTP_SOCKET_TIMEOUT_MS') || '20000', 10)

  console.log('连接参数:', {
    host,
    port,
    secure,
    user: user.replace(/(.{2}).+(@.+)/, '$1***$2'),
    from,
    to: to.replace(/(.{2}).+(@.+)/, '$1***$2'),
  })

  const transport = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
    connectionTimeout,
    greetingTimeout: connectionTimeout,
    socketTimeout,
  })

  const subject = `[SMTP自检] AI 用例平台 ${new Date().toISOString()}`
  const text = '若收到此邮件，说明当前 MAIL_* / SMTP_* 与 QQ SMTP 联通正常。'

  try {
    const info = await transport.sendMail({
      from,
      to,
      subject,
      text,
      html: `<p>${text}</p>`,
    })
    console.log('OK: SMTP 已接受邮件 messageId=', info.messageId ?? 'n/a')
    console.log('请到收件箱（及垃圾箱）查看:', to)
  } catch (e) {
    console.error('FAIL: SMTP 发送异常:', e instanceof Error ? e.message : e)
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
