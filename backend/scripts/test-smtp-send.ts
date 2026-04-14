/**
 * 自检发信：与 MailService 一致。
 * - 默认：SMTP（MAIL_HOST等）
 * - MAIL_PROVIDER=resend：Resend HTTPS API（Railway Hobby 等禁 SMTP 时用）
 *
 * 收件人：TEST_MAIL_TO；SMTP 未设时默认为自己（MAIL_USERNAME）
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

function smtpPreferIpv4(): boolean {
  const v = env('MAIL_SMTP_IPV4FIRST').toLowerCase()
  return !(v === '0' || v === 'false' || v === 'no')
}

function applyIpv4FirstDns() {
  if (!smtpPreferIpv4()) return
  if (typeof dns.setDefaultResultOrder !== 'function') return
  dns.setDefaultResultOrder('ipv4first')
  console.log('DNS: 已 setDefaultResultOrder("ipv4first")（与 MailService 一致）')
}

async function smtpConnectHostAndTls(hostname: string): Promise<{ host: string; servername?: string }> {
  if (!smtpPreferIpv4()) return { host: hostname }
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) return { host: hostname }
  if (hostname.includes(':')) return { host: hostname }
  try {
    const { address: ipv4 } = await dns.promises.lookup(hostname, { family: 4 })
    if (ipv4 && ipv4 !== hostname) {
      console.log(`SMTP: ${hostname} → ${ipv4}（A 记录，与线上 MailService 一致）`)
      return { host: ipv4, servername: hostname }
    }
  } catch (e) {
    console.warn(
      `SMTP: IPv4 解析失败，沿用主机名 — ${e instanceof Error ? e.message : String(e)}`,
    )
  }
  return { host: hostname }
}

async function sendResendSelfTest() {
  const key = env('RESEND_API_KEY')
  if (!key) {
    console.error('MAIL_PROVIDER=resend 时须设置 RESEND_API_KEY')
    process.exit(1)
  }
  const from = buildFrom()
  if (!from || from === 'no-reply@example.com') {
    console.error('请设置 MAIL_FROM_ADDRESS 等有效发件人（Resend 已验证域名）')
    process.exit(1)
  }
  const to = env('TEST_MAIL_TO')
  if (!to) {
    console.error('Resend 自检请设置 TEST_MAIL_TO=收件邮箱')
    process.exit(1)
  }
  const subject = `[Resend自检] AI 用例平台 ${new Date().toISOString()}`
  const text = '若收到此邮件，说明 Resend API 与 MAIL_FROM 配置正常。'
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject,
      text,
      html: `<p>${text}</p>`,
    }),
  })
  const json = (await res.json().catch(() => ({}))) as { id?: string }
  if (!res.ok) {
    console.error('FAIL: Resend HTTP', res.status, JSON.stringify(json))
    process.exit(1)
  }
  console.log('OK: Resend id=', json.id ?? 'n/a', '收件人', to)
}

async function main() {
  loadEnvFile(join(__dirname, '..', '.env'))

  if (env('MAIL_PROVIDER').toLowerCase() === 'resend') {
    await sendResendSelfTest()
    return
  }

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
  const connectionTimeout = parseInt(env('SMTP_CONNECTION_TIMEOUT_MS') || '60000', 10)
  const socketTimeout = parseInt(env('SMTP_SOCKET_TIMEOUT_MS') || '120000', 10)

  const manualSn = env('MAIL_TLS_SERVERNAME')
  const { host: connectHost, servername: snFromResolve } = await smtpConnectHostAndTls(host)
  const servername = manualSn || snFromResolve

  console.log('连接参数:', {
    host: connectHost,
    mailHost: host,
    port,
    secure,
    user: user.replace(/(.{2}).+(@.+)/, '$1***$2'),
    from,
    to: to.replace(/(.{2}).+(@.+)/, '$1***$2'),
    tlsServername: servername || '(默认)',
  })

  const transport = nodemailer.createTransport({
    host: connectHost,
    port,
    secure,
    auth: { user, pass },
    connectionTimeout,
    greetingTimeout: connectionTimeout,
    socketTimeout,
    ...(servername ? { tls: { servername } } : {}),
  })

  const subject = `[SMTP自检] AI 用例平台 ${new Date().toISOString()}`
  const text = '若收到此邮件，说明当前 MAIL_* / SMTP_* 与发信服务器（如 Outlook SMTP）联通正常。'

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
