import {
  Injectable,
  Logger,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  HttpException,
  HttpStatus,
  Optional,
} from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import * as bcrypt from 'bcryptjs'
import { randomInt } from 'node:crypto'
import { EmailOtpPurpose, type User } from '@prisma/client'
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
import { isDirectAvatarImageUrl, resolveAvatarUrlForStorage } from '@/common/avatar-url.util'
import { MailService } from '@/modules/mail/mail.service'
import { CaptchaService, type CaptchaAction } from './captcha.service'
import { JwtDenylistService } from './jwt-denylist.service'

const OTP_TTL_MS = 15 * 60 * 1000
const RESEND_COOLDOWN_MS = 60 * 1000
const USERNAME_RE = /^[a-zA-Z0-9_\u4e00-\u9fa5.-]+$/

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name)

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private passwordValidator: PasswordValidator,
    private mail: MailService,
    private captcha: CaptchaService,
    @Optional() private jwtDenylist?: JwtDenylistService,
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

  private expectedInviteCode(): string {
    return (process.env.AUTH_REGISTER_INVITE_CODE || '0628').trim()
  }

  private assertInviteCode(inviteCode?: string | null) {
    if ((inviteCode ?? '').trim() !== this.expectedInviteCode()) {
      throw new BadRequestException('邀请码无效，请确认后再注册')
    }
  }

  private async assertCaptcha(action: CaptchaAction, captchaId?: string | null, captchaCode?: string | null) {
    const ok = await this.captcha.validateAndConsume(action, captchaId, captchaCode)
    if (!ok) throw new BadRequestException('图形验证码错误或已过期，请刷新后重试')
  }

  private sanitizeUsernameSeed(seed: string): string {
    const cleaned = seed
      .trim()
      .replace(/\s+/g, '_')
      .replace(/[^a-zA-Z0-9_\u4e00-\u9fa5.-]/g, '')
      .slice(0, 32)
    return cleaned.length >= 2 ? cleaned : 'user'
  }

  private async resolveRegisterUsername(email: string, requested?: string | null): Promise<string> {
    const base = this.sanitizeUsernameSeed(requested?.trim() || email.split('@')[0] || 'user')
    if (!USERNAME_RE.test(base)) throw new BadRequestException('用户名仅支持字母、数字、下划线、中文、点与短横线')
    if (base.length < 2 || base.length > 50) throw new BadRequestException('用户名长度需为 2-50 个字符')

    for (let i = 0; i < 8; i += 1) {
      const candidate = i === 0 ? base : `${base.slice(0, 42)}_${randomInt(1000, 9999)}`
      // eslint-disable-next-line no-await-in-loop
      const taken = await this.prisma.user.findFirst({ where: { username: candidate } })
      if (!taken) return candidate
    }
    throw new ConflictException('用户名已被使用，请稍后重试')
  }

  private passwordLooksBcrypt(stored: string): boolean {
    const s = (stored || '').trim()
    return s.startsWith('$2a$') || s.startsWith('$2b$') || s.startsWith('$2y$')
  }

  /**
   * 校验密码：优先 bcrypt；若库中不是 bcrypt 形态且开启 AUTH_ALLOW_PLAINTEXT_PASSWORD，
   * 则允许明文比对并在成功后写回 bcrypt（便于从错误数据恢复）。
   */
  private async verifyUserPassword(userId: string, plain: string, storedRaw: string): Promise<boolean> {
    const stored = (storedRaw || '').trim()
    if (!stored) return false

    if (this.passwordLooksBcrypt(stored)) {
      return bcrypt.compare(plain, stored)
    }

    const allowPlain =
      process.env.AUTH_ALLOW_PLAINTEXT_PASSWORD?.trim() === '1' ||
      process.env.AUTH_ALLOW_PLAINTEXT_PASSWORD?.trim().toLowerCase() === 'true'

    if (allowPlain && plain === stored) {
      try {
        const hashed = await bcrypt.hash(plain, 10)
        await this.prisma.user.update({ where: { id: userId }, data: { password: hashed } })
      } catch (e) {
        this.logger.warn(
          `登录成功但明文密码升级为 bcrypt 失败 userId=${userId}: ${e instanceof Error ? e.message : String(e)}`,
        )
      }
      return true
    }

    return false
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
    await this.assertCaptcha('login', dto.captchaId, dto.captchaCode)
    const rawLogin = (dto.email || dto.username || '').trim()
    const plainPwd = (dto.password ?? '').trim()
    if (!rawLogin || !plainPwd) {
      throw new UnauthorizedException('用户名或密码错误')
    }

    const asEmail = rawLogin.includes('@') ? this.normalizeEmail(rawLogin) : null

    const users: User[] = []
    const pushUnique = (user: User | null) => {
      if (user && !users.some((item) => item.id === user.id)) users.push(user)
    }

    // 登录框可填「用户名」或「邮箱」。优先精确命中，再做大小写不敏感兜底，避免一次登录扫描多条记录。
    pushUnique(await this.prisma.user.findUnique({ where: { username: rawLogin } }))
    if (asEmail) {
      pushUnique(await this.prisma.user.findUnique({ where: { email: asEmail } }))
    }
    pushUnique(
      await this.prisma.user.findFirst({
        where: { username: { equals: rawLogin, mode: 'insensitive' } },
        orderBy: { updatedAt: 'desc' },
      }),
    )
    if (asEmail) {
      pushUnique(
        await this.prisma.user.findFirst({
          where: { email: { equals: asEmail, mode: 'insensitive' } },
          orderBy: { updatedAt: 'desc' },
        }),
      )
    }
    if (users.length === 0) throw new UnauthorizedException('用户名或密码错误')

    let matched = null as (typeof users)[number] | null
    for (const u of users) {
      // eslint-disable-next-line no-await-in-loop
      const ok = await this.verifyUserPassword(u.id, plainPwd, u.password)
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
    this.assertInviteCode(dto.inviteCode)

    const email = this.normalizeEmail(dto.email)
    const mailReady = this.mail.getMailTransportReadiness()
    if (!mailReady.ready) {
      return {
        message: '发信通道未配置，暂时无法发送邮箱验证码',
        data: {
          email,
          mailConfigured: false,
          mailIssues: mailReady.issues,
        },
      }
    }

    await this.assertCaptcha('register', dto.captchaId, dto.captchaCode)

    const username = await this.resolveRegisterUsername(email, dto.username)

    if (dto.password !== dto.confirmPassword) {
      throw new BadRequestException('两次输入的密码不一致')
    }

    const existsEmail = await this.prisma.user.findUnique({ where: { email } })
    if (existsEmail) throw new ConflictException('该邮箱已被注册')

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
    const user = await this.prisma.user.findUnique({
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
    if (!user) return null
    return this.ensureResolvedAvatar(user)
  }

  async updateProfile(userId: string, data: { username?: string; avatar?: string }) {
    if (data.username) {
      const usernameExists = await this.prisma.user.findFirst({ where: { username: data.username } })
      if (usernameExists && usernameExists.id !== userId) {
        throw new ConflictException('该用户名已被使用')
      }
    }

    let avatar: string | null | undefined
    if (data.avatar !== undefined) {
      try {
        avatar = await resolveAvatarUrlForStorage(data.avatar)
      } catch (e) {
        throw new BadRequestException(e instanceof Error ? e.message : '头像 URL 无效')
      }
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(data.username !== undefined ? { username: data.username } : {}),
        ...(avatar !== undefined ? { avatar } : {}),
      },
      select: { id: true, email: true, username: true, role: true, avatar: true },
    })
    return updated
  }

  /** 历史数据若存的是图床页面链接，读取时尝试解析为直链并回写 */
  private async ensureResolvedAvatar<T extends { id: string; avatar: string | null }>(user: T): Promise<T> {
    const raw = user.avatar?.trim()
    if (!raw || isDirectAvatarImageUrl(raw)) return user
    try {
      const resolved = await resolveAvatarUrlForStorage(raw)
      if (resolved && resolved !== raw) {
        await this.prisma.user.update({ where: { id: user.id }, data: { avatar: resolved } })
        return { ...user, avatar: resolved }
      }
    } catch {
      // 保留原值，前端显示 fallback
    }
    return user
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

  async logout(userId: string, token?: string) {
    const decoded = token ? this.jwtService.decode(token) : null
    const exp =
      typeof decoded === 'object' && decoded && 'exp' in decoded
        ? Number((decoded as { exp?: unknown }).exp)
        : undefined
    await this.jwtDenylist?.revoke(token, Number.isFinite(exp) ? exp : undefined)
    this.logger.log(`User ${userId} logged out`)
    return {}
  }
}
