import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import nodemailer from 'nodemailer'

export type MailPayload = {
  to: string
  subject: string
  text: string
  html?: string
}

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

    return nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass },
    })
  }

  async sendMail(payload: MailPayload) {
    const transport = this.buildTransport()
    if (!transport) {
      this.logger.warn('SMTP 未配置，跳过发送邮件')
      return { skipped: true }
    }

    const from =
      this.config.get<string>('SMTP_FROM')?.trim() ||
      this.config.get<string>('SMTP_USER')?.trim() ||
      'no-reply@example.com'

    const info = await transport.sendMail({
      from,
      to: payload.to,
      subject: payload.subject,
      text: payload.text,
      html: payload.html,
    })

    return { skipped: false, messageId: info.messageId }
  }
}

