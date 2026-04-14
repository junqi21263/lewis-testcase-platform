import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import * as nodemailer from 'nodemailer'

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

  constructor(private config: ConfigService) {}

  private buildTransport() {
    const host = this.config.get<string>('SMTP_HOST')?.trim()
    const port = parseInt(this.config.get<string>('SMTP_PORT') || '587', 10)
    const user = this.config.get<string>('SMTP_USER')?.trim()
    const pass = this.config.get<string>('SMTP_PASS')?.trim()
    const secure = String(this.config.get<string>('SMTP_SECURE') || '').trim() === 'true'

    if (!host || !user || !pass) return null

    const connectionTimeout = parseInt(
      this.config.get<string>('SMTP_CONNECTION_TIMEOUT_MS') || '15000',
      10,
    )
    const socketTimeout = parseInt(this.config.get<string>('SMTP_SOCKET_TIMEOUT_MS') || '20000', 10)

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
      this.logger.warn('SMTP 未配置，跳过发送邮件')
      return { skipped: true }
    }

    const from =
      this.config.get<string>('SMTP_FROM')?.trim() ||
      this.config.get<string>('SMTP_USER')?.trim() ||
      'no-reply@example.com'

    try {
      const info = await transport.sendMail({
        from,
        to: payload.to,
        subject: payload.subject,
        text: payload.text,
        html: payload.html,
      })
      return { skipped: false, messageId: info.messageId }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      this.logger.error(`SMTP 发送失败: ${msg}`)
      return { skipped: true, sendFailed: true }
    }
  }
}

