import {
  Injectable,
  Logger,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  HttpException,
  HttpStatus,
} from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import * as bcrypt from 'bcryptjs'
import { randomInt } from 'node:crypto'
import { EmailOtpPurpose } from '@prisma/client'
import { PrismaService } from '@/prisma/prisma.service'
import {
  LoginDto,
  RegisterSendCodeDto,
  RegisterConfirmDto,
  RegisterResendCodeDto,
  ChangePasswordDto,
  ForgotPasswordDto,
  ResetPasswordDto,
} from './dto/auth.dto'
import { PasswordValidator } from '@/common/validators/password.validator'
import { MailService } from '@/modules/mail/mail.service'

const OTP_TTL_MS = 15 * 60 * 1000
const RESEND_COOLDOWN_MS = 60 * 1000

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name)

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private passwordValidator: PasswordValidator,
    private mail: MailService,
  ) {}

  /**
   * 管理员模式：临时关闭注册/找回密码/邮件验证码，只允许管理员登录。
   * - 显式设置 AUTH_ADMIN_ONLY=true/false
   * - 未设置时：生产环境默认开启，开发环境默认关闭
   */
  private adminOnly(): boolean {
    const raw = (process.env.AUTH_ADMIN_ONLY || '').trim().toLowerCase()
    if (raw === '1' || raw === 'true' || raw === 'yes') return true
    if (raw === '0' || raw === 'false' || raw === 'no') return false
    return process.env.NODE_ENV === 'production'
  }

  private assertAdminOnlyAllowed(action: string) {
    if (!this.adminOnly()) return
    throw new BadRequestException(`当前已关闭${action}功能，请使用管理员账号登录或联系管理员`)
  }

  private normalizeEmail(raw: string) {
    return raw.trim().toLowerCase()
  }

  private generateOtp(): string {
    return randomInt(0, 1_000_000).toString().padStart(6, '0')
  }

  private assertResendCooldown(updatedAt: Date) {
    const elapsed = Date.now() - updatedAt.getTime()
    if (elapsed < RESEND_COOLDOWN_MS) {
      const sec = Math.ceil((RESEND_COOLDOWN_MS - elapsed) / 1000)
      throw new HttpException(`发送过于频繁，请 ${sec} 秒后再试`, HttpStatus.TOO_MANY_REQUESTS)
    }
  }

  private async queueOtpEmail(
    to: string,
    plainCode: string,
    kind: 'register' | 'reset',
  ): Promise<void> {
    const subject =
      kind === 'register' ? '注册验证码（AI 用例平台）' : '重置密码验证码（AI 用例平台）'
    const intro =
      kind === 'register'
        ? '你正在注册账号，请使用以下验证码完成注册（15 分钟内有效）。'
        : '你正在重置密码，请使用以下验证码（15 分钟内有效）。'
    const text = `${intro}\n\n验证码：${plainCode}\n\n如非本人操作请忽略本邮件。`
    const html = `<p>${intro}</p><p style="font-size:22px;font-weight:bold;letter-spacing:4px">${plainCode}</p><p>如非本人操作请忽略。</p>`

    const sent = await this.mail.sendMail({ to, subject, text, html })
    if ('sendFailed' in sent && sent.sendFailed) {
      this.logger.warn(`验证码邮件可能未送达 ${to}，请检查 MAIL_* / SMTP 配置与日志`)
    }
  }

  async login(dto: LoginDto) {
    const rawLogin = dto.username.trim()
    const asEmail = rawLogin.includes('@') ? this.normalizeEmail(rawLogin) : null
    // 登录框可填「用户名」或「邮箱」；username 在历史库中未必有唯一约束时，允许匹配任意一条密码正确的记录。
    const users = await this.prisma.user.findMany({
      where: asEmail
        ? { OR: [{ username: rawLogin }, { email: asEmail }] }
        : { username: rawLogin },
      orderBy: { updatedAt: 'desc' },
      take: 10,
    })
    if (users.length === 0) throw new UnauthorizedException('用户名或密码错误')

    let matched = null as (typeof users)[number] | null
    for (const u of users) {
      // bcryptjs compare 为 CPU 密集，用户量很小时可接受；这里最多检查 10 条
      // eslint-disable-next-line no-await-in-loop
      const ok = await bcrypt.compare(dto.password, u.password)
      if (ok) {
        matched = u
        break
      }
    }
    if (!matched) throw new UnauthorizedException('用户名或密码错误')

    const token = this.jwtService.sign({
      sub: matched.id,
      email: matched.email,
      role: matched.role,
    })
    const { password: _, ...userInfo } = matched

    return { accessToken: token, user: userInfo }
  }

  /** 注册第一步：校验资料、写入待验证记录、发验证码（不写 users） */
  async registerSendCode(dto: RegisterSendCodeDto) {
    this.assertAdminOnlyAllowed('注册')
    const email = this.normalizeEmail(dto.email)
    const username = dto.username.trim()

    const existsEmail = await this.prisma.user.findUnique({ where: { email } })
    if (existsEmail) throw new ConflictException('该邮箱已被注册')

    const usernameTaken = await this.prisma.user.findFirst({ where: { username } })
    if (usernameTaken) throw new ConflictException('该用户名已被使用')

    const passwordValidation = this.passwordValidator.validate(dto.password)
    if (!passwordValidation.valid) {
      throw new BadRequestException(`密码强度不足: ${passwordValidation.errors.join(', ')}`)
    }

    const existing = await this.prisma.emailOtpChallenge.findUnique({
      where: { email_purpose: { email, purpose: EmailOtpPurpose.REGISTER } },
    })
    if (existing) {
      this.assertResendCooldown(existing.updatedAt)
    }

    const plainCode = this.generateOtp()
    const codeHash = await bcrypt.hash(plainCode, 10)
    const passwordHash = await bcrypt.hash(dto.password, 10)
    const expiresAt = new Date(Date.now() + OTP_TTL_MS)

    await this.prisma.emailOtpChallenge.upsert({
      where: { email_purpose: { email, purpose: EmailOtpPurpose.REGISTER } },
      create: {
        email,
        purpose: EmailOtpPurpose.REGISTER,
        codeHash,
        expiresAt,
        username,
        passwordHash,
        avatar: dto.avatar ?? null,
      },
      update: {
        codeHash,
        expiresAt,
        username,
        passwordHash,
        avatar: dto.avatar ?? null,
      },
    })

    const mailReady = this.mail.getMailTransportReadiness()
    void this.queueOtpEmail(email, plainCode, 'register').catch((err) =>
      this.logger.error(
        `异步发送注册验证码失败: ${err instanceof Error ? err.message : String(err)}`,
      ),
    )

    if (process.env.NODE_ENV !== 'production') {
      this.logger.log(`[dev] 注册验证码 ${email}: ${plainCode}`)
    }

    return {
      message: mailReady.ready
        ? '验证码已发送，请查收邮箱（含垃圾箱），15 分钟内有效'
        : '验证码已生成，但发信环境未就绪，无法发出邮件；开发环境请查看服务端日志中的验证码',
      data: {
        email,
        mailConfigured: mailReady.ready,
        ...(mailReady.ready ? {} : { mailIssues: mailReady.issues }),
      },
    }
  }

  /** 注册第二步：校验验证码并创建已验证用户 */
  async registerConfirm(dto: RegisterConfirmDto) {
    this.assertAdminOnlyAllowed('注册')
    const email = this.normalizeEmail(dto.email)
    const challenge = await this.prisma.emailOtpChallenge.findUnique({
      where: { email_purpose: { email, purpose: EmailOtpPurpose.REGISTER } },
    })

    if (!challenge || !challenge.username || !challenge.passwordHash) {
      throw new BadRequestException('验证码无效或已过期，请重新获取验证码')
    }
    if (challenge.expiresAt.getTime() < Date.now()) {
      await this.prisma.emailOtpChallenge.delete({
        where: { email_purpose: { email, purpose: EmailOtpPurpose.REGISTER } },
      }).catch(() => undefined)
      throw new BadRequestException('验证码已过期，请重新获取')
    }

    const ok = await bcrypt.compare(dto.code, challenge.codeHash)
    if (!ok) {
      throw new BadRequestException('验证码错误')
    }

    const username = challenge.username
    const existsEmail = await this.prisma.user.findUnique({ where: { email } })
    if (existsEmail) throw new ConflictException('该邮箱已被注册')

    const usernameTaken = await this.prisma.user.findFirst({ where: { username } })
    if (usernameTaken) throw new ConflictException('该用户名已被使用')

    const user = await this.prisma.$transaction(async (tx) => {
      await tx.emailOtpChallenge.delete({
        where: { email_purpose: { email, purpose: EmailOtpPurpose.REGISTER } },
      })
      return tx.user.create({
        data: {
          email,
          username,
          password: challenge.passwordHash!,
          avatar: challenge.avatar ?? undefined,
          emailVerified: true,
        },
        select: {
          id: true,
          email: true,
          username: true,
          role: true,
          avatar: true,
          teamId: true,
          emailVerified: true,
          createdAt: true,
          updatedAt: true,
        },
      })
    })

    const token = this.jwtService.sign({ sub: user.id, email: user.email, role: user.role })
    return {
      message: '注册成功',
      data: { accessToken: token, user },
    }
  }

  /** 仅邮箱重发注册验证码 */
  async registerResendCode(dto: RegisterResendCodeDto) {
    this.assertAdminOnlyAllowed('注册')
    const email = this.normalizeEmail(dto.email)
    const challenge = await this.prisma.emailOtpChallenge.findUnique({
      where: { email_purpose: { email, purpose: EmailOtpPurpose.REGISTER } },
    })

    if (!challenge) {
      return {}
    }

    this.assertResendCooldown(challenge.updatedAt)

    const plainCode = this.generateOtp()
    const codeHash = await bcrypt.hash(plainCode, 10)
    const expiresAt = new Date(Date.now() + OTP_TTL_MS)

    await this.prisma.emailOtpChallenge.update({
      where: { email_purpose: { email, purpose: EmailOtpPurpose.REGISTER } },
      data: { codeHash, expiresAt },
    })

    const mailReady = this.mail.getMailTransportReadiness()
    void this.queueOtpEmail(email, plainCode, 'register').catch((err) =>
      this.logger.error(
        `异步重发注册验证码失败: ${err instanceof Error ? err.message : String(err)}`,
      ),
    )

    if (process.env.NODE_ENV !== 'production') {
      this.logger.log(`[dev] 重发注册验证码 ${email}: ${plainCode}`)
    }

    return {
      message: mailReady.ready
        ? '验证码已重新发送'
        : '发信未就绪，开发环境请查看服务端日志中的验证码',
      data: {
        email,
        mailConfigured: mailReady.ready,
        ...(mailReady.ready ? {} : { mailIssues: mailReady.issues }),
      },
    }
  }

  async getProfile(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        username: true,
        role: true,
        avatar: true,
        teamId: true,
        emailVerified: true,
        createdAt: true,
        updatedAt: true,
      },
    })
  }

  async updateProfile(userId: string, data: { username?: string; avatar?: string }) {
    if (data.username) {
      const usernameExists = await this.prisma.user.findFirst({ where: { username: data.username } })
      if (usernameExists && usernameExists.id !== userId) {
        throw new ConflictException('该用户名已被使用')
      }
    }

    return this.prisma.user.update({
      where: { id: userId },
      data,
      select: { id: true, email: true, username: true, role: true, avatar: true },
    })
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } })
    if (!user) throw new UnauthorizedException('用户不存在')

    const isMatch = await bcrypt.compare(dto.oldPassword, user.password)
    if (!isMatch) throw new BadRequestException('当前密码错误')

    const passwordValidation = this.passwordValidator.validate(dto.newPassword)
    if (!passwordValidation.valid) {
      throw new BadRequestException(`新密码强度不足: ${passwordValidation.errors.join(', ')}`)
    }

    const hashed = await bcrypt.hash(dto.newPassword, 10)
    await this.prisma.user.update({ where: { id: userId }, data: { password: hashed } })
  }

  async forgotPassword(dto: ForgotPasswordDto) {
    this.assertAdminOnlyAllowed('找回密码')
    const email = this.normalizeEmail(dto.email)
    const user = await this.prisma.user.findUnique({ where: { email } })

    if (user) {
      const existing = await this.prisma.emailOtpChallenge.findUnique({
        where: { email_purpose: { email, purpose: EmailOtpPurpose.PASSWORD_RESET } },
      })
      if (existing) {
        this.assertResendCooldown(existing.updatedAt)
      }

      const plainCode = this.generateOtp()
      const codeHash = await bcrypt.hash(plainCode, 10)
      const expiresAt = new Date(Date.now() + OTP_TTL_MS)

      await this.prisma.emailOtpChallenge.upsert({
        where: { email_purpose: { email, purpose: EmailOtpPurpose.PASSWORD_RESET } },
        create: {
          email,
          purpose: EmailOtpPurpose.PASSWORD_RESET,
          codeHash,
          expiresAt,
        },
        update: { codeHash, expiresAt },
      })

      void this.queueOtpEmail(email, plainCode, 'reset').catch((err) =>
        this.logger.error(
          `异步发送重置验证码失败: ${err instanceof Error ? err.message : String(err)}`,
        ),
      )

      if (process.env.NODE_ENV !== 'production') {
        this.logger.log(`[dev] 重置密码验证码 ${email}: ${plainCode}`)
      }
    }

    return {}
  }

  async resetPassword(dto: ResetPasswordDto) {
    this.assertAdminOnlyAllowed('找回密码')
    const email = this.normalizeEmail(dto.email)
    const challenge = await this.prisma.emailOtpChallenge.findUnique({
      where: { email_purpose: { email, purpose: EmailOtpPurpose.PASSWORD_RESET } },
    })

    if (!challenge) {
      throw new BadRequestException('验证码无效或已过期')
    }
    if (challenge.expiresAt.getTime() < Date.now()) {
      await this.prisma.emailOtpChallenge.delete({
        where: { email_purpose: { email, purpose: EmailOtpPurpose.PASSWORD_RESET } },
      }).catch(() => undefined)
      throw new BadRequestException('验证码已过期，请重新获取')
    }

    const ok = await bcrypt.compare(dto.code, challenge.codeHash)
    if (!ok) {
      throw new BadRequestException('验证码错误')
    }

    const user = await this.prisma.user.findUnique({ where: { email } })
    if (!user) {
      await this.prisma.emailOtpChallenge.delete({
        where: { email_purpose: { email, purpose: EmailOtpPurpose.PASSWORD_RESET } },
      }).catch(() => undefined)
      throw new BadRequestException('验证码无效或已过期')
    }

    const passwordValidation = this.passwordValidator.validate(dto.newPassword)
    if (!passwordValidation.valid) {
      throw new BadRequestException(`新密码强度不足: ${passwordValidation.errors.join(', ')}`)
    }

    const hashed = await bcrypt.hash(dto.newPassword, 10)
    await this.prisma.$transaction([
      this.prisma.emailOtpChallenge.delete({
        where: { email_purpose: { email, purpose: EmailOtpPurpose.PASSWORD_RESET } },
      }),
      this.prisma.user.update({ where: { id: user.id }, data: { password: hashed } }),
    ])

    return {}
  }

  async logout(userId: string) {
    console.log(`User ${userId} logged out`)
    return {}
  }
}
