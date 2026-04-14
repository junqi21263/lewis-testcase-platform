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

  /** 避免 smtp.qq.com 等解析出 AAAA 后走 IPv6，在 Railway等环境常报 ENETUNREACH */
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
      `MAIL_FROM_ADDRESS（${fromAddr}）与 MAIL_USERNAME（${login}）不一致，QQ 等邮箱易拒信；请改为同一发信账号`,
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

  private buildTransport() {
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

    const connectionTimeout = parseInt(
      envStr(this.config, 'SMTP_CONNECTION_TIMEOUT_MS') || '15000',
      10,
    )
    const socketTimeout = parseInt(envStr(this.config, 'SMTP_SOCKET_TIMEOUT_MS') || '20000', 10)

    return nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass },
      connectionTimeout,
      greetingTimeout: connectionTimeout,
      socketTimeout,
    })
  }

  async sendMail(payload: MailPayload): Promise<SendMailResult> {
    const transport = this.buildTransport()
    if (!transport) {
      this.logger.warn('邮件未配置（MAIL_* 或 SMTP_*），跳过发送')
      return { skipped: true }
    }

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
      return { skipped: true, sendFailed: true }
    }
  }
}
