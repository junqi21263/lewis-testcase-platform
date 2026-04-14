import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import * as nodemailer from 'nodemailer'
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

  constructor(private config: ConfigService) {}

  /**
   * 同步检测：是否具备发送「带验证/重置链接」邮件的条件（不连 SMTP）。
   * 用于接口如实返回；异步任务里仍可能因账号/网络被拒。
   */
  getVerificationMailReadiness(): { ready: boolean; issues: string[] } {
    const issues: string[] = []
    if (!envStr(this.config, 'FRONTEND_URL')) {
      issues.push('未设置 FRONTEND_URL（无法生成验证链接）')
    }
    if (!envStr(this.config, 'SMTP_HOST')) issues.push('未设置 SMTP_HOST')
    if (!envStr(this.config, 'SMTP_USER')) issues.push('未设置 SMTP_USER')
    if (!envStr(this.config, 'SMTP_PASS')) issues.push('未设置 SMTP_PASS')
    return { ready: issues.length === 0, issues }
  }

  private buildTransport() {
    const host = envStr(this.config, 'SMTP_HOST')
    const port = parseInt(envStr(this.config, 'SMTP_PORT') || '587', 10)
    const user = envStr(this.config, 'SMTP_USER')
    const pass = envStr(this.config, 'SMTP_PASS')
    const secure = envStr(this.config, 'SMTP_SECURE').toLowerCase() === 'true'

    if (!host || !user || !pass) return null

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
      this.logger.warn('SMTP 未配置，跳过发送邮件')
      return { skipped: true }
    }

    const from =
      envStr(this.config, 'SMTP_FROM') ||
      envStr(this.config, 'SMTP_USER') ||
      'no-reply@example.com'

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

