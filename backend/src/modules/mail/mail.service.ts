import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import * as nodemailer from 'nodemailer'
import * as dns from 'node:dns'
import { envStr } from '@/common/utils/config-env.util'

export type MailPayload = {
  to: string
  subject: string
  text: string
  html?: string
}

/** skipped=true：未配置 SMTP，或发送过程抛错（sendFailed 区分） */
export type SendMailResult =
  | { skipped: true; sendFailed?: true }
  | { skipped: false; messageId: string }

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name)

  /** 避免 SMTP 主机名解析出 AAAA 后优先走 IPv6，在 Railway 等环境常报 ENETUNREACH */
  private static smtpDnsIpv4FirstApplied = false

  constructor(private config: ConfigService) {
    this.applySmtpDnsPreferIpv4()
    this.warnIfFromAddressMismatchesLogin()
  }

  /** 默认 true；设 MAIL_SMTP_IPV4FIRST=false 时关闭（仅用系统默认解析顺序）。 */
  private smtpPreferIpv4(): boolean {
    const raw = envStr(this.config, 'MAIL_SMTP_IPV4FIRST').toLowerCase()
    return !(raw === '0' || raw === 'false' || raw === 'no')
  }

  /**
   * 默认开启：SMTP 连接优先使用 IPv4（可通过 MAIL_SMTP_IPV4FIRST=false 关闭）。
   * 与日志中 `connect ENETUNREACH 240d:...:587` 同类问题对应。
   */
  private applySmtpDnsPreferIpv4() {
    if (!this.smtpPreferIpv4()) return
    if (MailService.smtpDnsIpv4FirstApplied) return
    if (typeof dns.setDefaultResultOrder !== 'function') return
    dns.setDefaultResultOrder('ipv4first')
    MailService.smtpDnsIpv4FirstApplied = true
    this.logger.log('SMTP DNS 已设为 ipv4first（缓解云平台 IPv6 不可达导致的 ENETUNREACH）')
  }

  private warnIfFromAddressMismatchesLogin() {
    const fromAddr = envStr(this.config, 'MAIL_FROM_ADDRESS')
    const login = this.smtpUser()
    if (!fromAddr || !login) return
    if (fromAddr.toLowerCase() === login.toLowerCase()) return
    this.logger.warn(
      `MAIL_FROM_ADDRESS（${fromAddr}）与 MAIL_USERNAME（${login}）不一致，Outlook 等邮箱易拒信；请改为同一发信账号`,
    )
  }

  /**
   * 同步检测：是否具备发信能力（不连 SMTP）。
   * 支持 Laravel 风格 MAIL_* 与原有 SMTP_*。
   */
  getMailTransportReadiness(): { ready: boolean; issues: string[] } {
    const issues: string[] = []
    const host = this.smtpHost()
    const user = this.smtpUser()
    const pass = this.smtpPass()
    if (!host) issues.push('未设置 MAIL_HOST 或 SMTP_HOST')
    if (!user) issues.push('未设置 MAIL_USERNAME 或 SMTP_USER')
    if (!pass) issues.push('未设置 MAIL_PASSWORD 或 SMTP_PASS')
    return { ready: issues.length === 0, issues }
  }

  /** @deprecated 使用 getMailTransportReadiness；验证码发信不依赖 FRONTEND_URL */
  getVerificationMailReadiness(): { ready: boolean; issues: string[] } {
    return this.getMailTransportReadiness()
  }

  private smtpHost(): string {
    return envStr(this.config, 'MAIL_HOST') || envStr(this.config, 'SMTP_HOST')
  }

  private smtpPort(): number {
    const p = envStr(this.config, 'MAIL_PORT') || envStr(this.config, 'SMTP_PORT') || '587'
    return parseInt(p, 10) || 587
  }

  private smtpUser(): string {
    return envStr(this.config, 'MAIL_USERNAME') || envStr(this.config, 'SMTP_USER')
  }

  private smtpPass(): string {
    return envStr(this.config, 'MAIL_PASSWORD') || envStr(this.config, 'SMTP_PASS')
  }

  /** true =直接 SSL（如 465）；false = STARTTLS（如 587 + tls） */
  private smtpSecure(): boolean {
    const legacy = envStr(this.config, 'SMTP_SECURE').toLowerCase() === 'true'
    const enc = envStr(this.config, 'MAIL_ENCRYPTION').toLowerCase()
    if (enc === 'ssl') return true
    if (enc === 'tls') return false
    return legacy
  }

  private buildFrom(): string {
    const nameRaw = envStr(this.config, 'MAIL_FROM_NAME')
    const addr = envStr(this.config, 'MAIL_FROM_ADDRESS')
    const legacy = envStr(this.config, 'SMTP_FROM')
    if (nameRaw.includes('<') && nameRaw.includes('>')) {
      return nameRaw
    }
    if (addr && nameRaw) {
      return `${nameRaw} <${addr}>`
    }
    if (addr) return addr
    if (legacy) return legacy
    return this.smtpUser() || 'no-reply@example.com'
  }

  /**
   * Railway 等环境 IPv6 不可达时，仅 setDefaultResultOrder 仍可能连到 AAAA。
   * 对 FQDN 查 A 记录，用 IPv4 连；连 IP 时通过 tls.servername 保持与证书一致。
   */
  private async smtpConnectHostAndTls(
    hostname: string,
  ): Promise<{ host: string; tls?: { servername: string } }> {
    if (!this.smtpPreferIpv4()) {
      return { host: hostname }
    }
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) {
      return { host: hostname }
    }
    if (hostname.includes(':')) {
      return { host: hostname }
    }
    try {
      const { address: ipv4 } = await dns.promises.lookup(hostname, { family: 4 })
      if (ipv4 && ipv4 !== hostname) {
        this.logger.log(`SMTP: ${hostname} → ${ipv4}（A 记录 / IPv4，避免 AAAA ENETUNREACH）`)
        return { host: ipv4, tls: { servername: hostname } }
      }
    } catch (e) {
      this.logger.warn(
        `SMTP: 未取到 IPv4（A），沿用主机名: ${hostname} — ${e instanceof Error ? e.message : String(e)}`,
      )
    }
    return { host: hostname }
  }

  private async createTransport(): Promise<{
    transport: ReturnType<typeof nodemailer.createTransport>
    peer: string
  } | null> {
    const host = this.smtpHost()
    const port = this.smtpPort()
    const user = this.smtpUser()
    const pass = this.smtpPass()
    let secure = this.smtpSecure()
    if (!host || !user || !pass) return null
    const enc = envStr(this.config, 'MAIL_ENCRYPTION').toLowerCase()
    const hasLegacySecure = envStr(this.config, 'SMTP_SECURE') !== ''
    // 未显式设置 MAIL_ENCRYPTION / SMTP_SECURE 时：465 默认走 SSL
    if (!enc && !hasLegacySecure && port === 465) {
      secure = true
    }

    // 默认放宽：远距离链路 SMTP 握手可能较慢；仍超时可再调大或改用 465 / 中继服务
    const connectionTimeout = parseInt(
      envStr(this.config, 'SMTP_CONNECTION_TIMEOUT_MS') || '60000',
      10,
    )
    const socketTimeout = parseInt(envStr(this.config, 'SMTP_SOCKET_TIMEOUT_MS') || '120000', 10)

    const { host: connectHost, tls: tlsExtra } = await this.smtpConnectHostAndTls(host)
    const manualServername = envStr(this.config, 'MAIL_TLS_SERVERNAME')
    const servername = manualServername || tlsExtra?.servername

    const peer = `${connectHost}:${port} ${secure ? 'SMTPS' : 'STARTTLS'}${servername ? ` SNI=${servername}` : ''} conn=${connectionTimeout}ms sock=${socketTimeout}ms`

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
    return { transport, peer }
  }

  async sendMail(payload: MailPayload): Promise<SendMailResult> {
    const built = await this.createTransport()
    if (!built) {
      this.logger.warn('邮件未配置（MAIL_* 或 SMTP_*），跳过发送')
      return { skipped: true }
    }
    const { transport, peer } = built

    const from = this.buildFrom()

    try {
      const info = await transport.sendMail({
        from,
        to: payload.to,
        subject: payload.subject,
        text: payload.text,
        html: payload.html,
      })
      this.logger.log(
        `SMTP 已接受邮件: to=${payload.to} subject=${payload.subject} messageId=${info.messageId ?? 'n/a'}`,
      )
      return { skipped: false, messageId: info.messageId }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      this.logger.error(`SMTP 发送失败: ${msg}`)
      if (/timeout/i.test(msg)) {
        this.logger.warn(
          `SMTP 连接/握手超时（本次 ${peer}）。再大超时往往无效：请试 MAIL_PORT=465 + MAIL_ENCRYPTION=ssl，或换 Resend/SendGrid 等 HTTPS 发信；部分 SMTP 从海外机房直连可能被限速/丢弃。采集日志可设 NO_COLOR=1 去掉 ANSI。`,
        )
      }
      return { skipped: true, sendFailed: true }
    }
  }
}
