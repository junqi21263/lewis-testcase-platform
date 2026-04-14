import {
  Injectable,
  Logger,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { ConfigService } from '@nestjs/config'
import * as bcrypt from 'bcryptjs'
import { PrismaService } from '@/prisma/prisma.service'
import {
  LoginDto,
  RegisterDto,
  ChangePasswordDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  VerifyEmailDto,
  ResendVerificationDto,
} from './dto/auth.dto'
import { PasswordValidator } from '@/common/validators/password.validator'
import { MailService } from '@/modules/mail/mail.service'
import { envStr } from '@/common/utils/config-env.util'

const JWT_PURPOSE_VERIFY_EMAIL = 'verify_email' as const
const JWT_PURPOSE_RESET_PASSWORD = 'reset_password' as const

type JwtAuthPayload = { sub: string; email: string; purpose?: string }

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name)

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private passwordValidator: PasswordValidator,
    private config: ConfigService,
    private mail: MailService,
  ) {}

  async login(dto: LoginDto) {
    const username = dto.username.trim()
    const user = await this.prisma.user.findFirst({ where: { username } })
    if (!user) throw new UnauthorizedException('用户名或密码错误')

    const isMatch = await bcrypt.compare(dto.password, user.password)
    if (!isMatch) throw new UnauthorizedException('用户名或密码错误')

    if (!user.emailVerified) {
      throw new UnauthorizedException('请先完成邮箱验证，查收注册邮件中的链接')
    }

    const token = this.jwtService.sign({ sub: user.id, email: user.email, role: user.role })
    const { password: _, ...userInfo } = user

    return { accessToken: token, user: userInfo }
  }

  async register(dto: RegisterDto) {
    const email = dto.email.trim().toLowerCase()
    const username = dto.username.trim()

    // 检查邮箱是否已存在
    const exists = await this.prisma.user.findUnique({ where: { email } })
    if (exists) throw new ConflictException('该邮箱已被注册')

    // 检查用户名是否已存在
    const usernameExists = await this.prisma.user.findFirst({ where: { username } })
    if (usernameExists) throw new ConflictException('该用户名已被使用')

    // 验证密码强度
    const passwordValidation = this.passwordValidator.validate(dto.password)
    if (!passwordValidation.valid) {
      throw new BadRequestException(`密码强度不足: ${passwordValidation.errors.join(', ')}`)
    }

    // 生成密码哈希
    const hashed = await bcrypt.hash(dto.password, 10)
    
    // 创建用户（需邮件验证后方可登录）
    const user = await this.prisma.user.create({
      data: {
        email,
        username,
        password: hashed,
        avatar: dto.avatar,
        emailVerified: false,
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

    const mailReady = this.mail.getVerificationMailReadiness()

    // 异步发信，避免 SMTP 握手/网络卡住导致 HTTP 长时间无响应（前端 60s 超时）
    void this.sendVerificationEmail(user.id, user.email).catch((err) => {
      this.logger.error(
        `注册后异步发送验证邮件失败: ${err instanceof Error ? err.message : String(err)}`,
      )
    })

    return {
      message: mailReady.ready
        ? '注册成功，验证邮件已排队发送，请查收邮箱（含垃圾邮件箱）完成验证后再登录'
        : '注册成功，但发信环境未就绪，验证邮件无法发出；请配置 FRONTEND_URL 与 SMTP 或使用管理员协助验证',
      data: {
        email: user.email,
        needsEmailVerification: true as const,
        verificationMailConfigured: mailReady.ready,
        ...(mailReady.ready ? {} : { verificationMailIssues: mailReady.issues }),
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
    // 检查用户名是否已被使用
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

    // 验证新密码强度
    const passwordValidation = this.passwordValidator.validate(dto.newPassword)
    if (!passwordValidation.valid) {
      throw new BadRequestException(`新密码强度不足: ${passwordValidation.errors.join(', ')}`)
    }

    const hashed = await bcrypt.hash(dto.newPassword, 10)
    await this.prisma.user.update({ where: { id: userId }, data: { password: hashed } })
  }

  async forgotPassword(dto: ForgotPasswordDto) {
    const email = dto.email.trim().toLowerCase()
    const user = await this.prisma.user.findUnique({ where: { email } })

    if (user) {
      const resetToken = this.jwtService.sign(
        { sub: user.id, email: user.email, purpose: JWT_PURPOSE_RESET_PASSWORD },
        { expiresIn: '1h' },
      )
      const frontend = envStr(this.config, 'FRONTEND_URL').replace(/\/+$/, '')
      const resetUrl = frontend ? `${frontend}/reset-password/${encodeURIComponent(resetToken)}` : ''

      if (!resetUrl) {
        this.logger.warn(
          'FRONTEND_URL 未设置，无法生成重置密码链接，已跳过发送邮件（注册验证邮件同样依赖 FRONTEND_URL）',
        )
      }

      // 异步发信，避免请求被 SMTP 拖满超时
      if (resetUrl) {
        void this.mail
          .sendMail({
            to: user.email,
            subject: '重置密码（邮箱验证）',
            text: `我们收到你的重置密码请求。打开下方链接即表示你确认该邮箱可接收本操作。\n\n请在 1 小时内打开链接设置新密码：\n${resetUrl}\n\n若非本人操作请忽略此邮件。`,
            html: `
            <p>我们收到你的重置密码请求。打开链接即表示你确认该邮箱可接收本操作。</p>
            <p>请在 <b>1 小时</b> 内打开链接设置新密码：</p>
            <p><a href="${resetUrl}">${resetUrl}</a></p>
            <p>若非本人操作请忽略此邮件。</p>
          `,
          })
          .then((sent) => {
            if ('sendFailed' in sent && sent.sendFailed) {
              this.logger.warn(`重置密码邮件未能送达 ${user.email}，请检查 SMTP 日志`)
            }
          })
          .catch((err) =>
            this.logger.error(
              `异步发送重置密码邮件失败: ${err instanceof Error ? err.message : String(err)}`,
            ),
          )
      }

      if (process.env.NODE_ENV !== 'production') {
        console.log(`Password reset token for ${user.email}: ${resetToken}`)
      }
    }

    // 统一文案，避免被用于探测邮箱是否注册（具体说明由响应拦截器 message 字段给出）
    return {}
  }

  async resetPassword(dto: ResetPasswordDto) {
    try {
      const payload = this.jwtService.verify(dto.token) as JwtAuthPayload
      if (payload.purpose !== undefined && payload.purpose !== JWT_PURPOSE_RESET_PASSWORD) {
        throw new BadRequestException('无效的重置令牌')
      }
      const user = await this.prisma.user.findUnique({ where: { id: payload.sub } })

      if (!user || user.email !== payload.email) {
        throw new BadRequestException('无效的重置令牌')
      }

      const hashed = await bcrypt.hash(dto.newPassword, 10)
      await this.prisma.user.update({ where: { id: user.id }, data: { password: hashed } })

      return {}
    } catch (error) {
      throw new BadRequestException('无效的重置令牌或已过期')
    }
  }

  async verifyEmail(dto: VerifyEmailDto) {
    try {
      const email = dto.email.trim().toLowerCase()
      const payload = this.jwtService.verify(dto.token) as JwtAuthPayload
      if (payload.purpose !== JWT_PURPOSE_VERIFY_EMAIL) {
        throw new BadRequestException('无效的验证令牌')
      }
      if (payload.email.trim().toLowerCase() !== email) {
        throw new BadRequestException('无效的验证令牌')
      }

      const user = await this.prisma.user.findFirst({
        where: { id: payload.sub, email },
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
      if (!user) throw new BadRequestException('无效的验证令牌')

      if (user.emailVerified) {
        const token = this.jwtService.sign({ sub: user.id, email: user.email, role: user.role })
        return {
          message: '邮箱已验证',
          data: { accessToken: token, user },
        }
      }

      await this.prisma.user.update({
        where: { id: user.id },
        data: { emailVerified: true },
      })

      const updated = await this.prisma.user.findUnique({
        where: { id: user.id },
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
      if (!updated) throw new BadRequestException('验证失败')

      const token = this.jwtService.sign({
        sub: updated.id,
        email: updated.email,
        role: updated.role,
      })

      return {
        message: '邮箱验证成功',
        data: { accessToken: token, user: updated },
      }
    } catch (error) {
      if (error instanceof BadRequestException) throw error
      throw new BadRequestException('无效的验证令牌或已过期')
    }
  }

  /** 未验证用户重发注册验证邮件（防枚举：邮箱不存在或已验证时同样返回成功） */
  async resendVerificationEmail(dto: ResendVerificationDto) {
    const email = dto.email.trim().toLowerCase()
    const user = await this.prisma.user.findUnique({ where: { email } })
    if (user && !user.emailVerified) {
      void this.sendVerificationEmail(user.id, user.email).catch((err) => {
        this.logger.error(
          `重发验证邮件异步任务失败: ${err instanceof Error ? err.message : String(err)}`,
        )
      })
    }
    return {}
  }

  private async sendVerificationEmail(userId: string, email: string) {
    const verificationToken = this.jwtService.sign(
      { sub: userId, email, purpose: JWT_PURPOSE_VERIFY_EMAIL },
      { expiresIn: this.passwordValidator.verificationTokenExpiry },
    )
    const frontend = envStr(this.config, 'FRONTEND_URL').replace(/\/+$/, '')
    const q = new URLSearchParams({
      token: verificationToken,
      email,
    })
    const verifyUrl = frontend ? `${frontend}/verify-email?${q.toString()}` : ''

    if (!verifyUrl) {
      this.logger.warn(
        'FRONTEND_URL 未设置，无法生成邮箱验证链接，已跳过发送验证邮件（需同时配置 SMTP_HOST / SMTP_USER / SMTP_PASS）',
      )
    } else {
      const sent = await this.mail.sendMail({
        to: email,
        subject: '验证你的邮箱',
        text: `感谢注册。请在 24 小时内打开链接完成邮箱验证：\n${verifyUrl}\n\n若非本人注册请忽略。`,
        html: `
          <p>感谢注册。</p>
          <p>请在 <b>24 小时</b> 内打开链接完成邮箱验证：</p>
          <p><a href="${verifyUrl}">${verifyUrl}</a></p>
          <p>若非本人注册请忽略。</p>
        `,
      })
      if ('sendFailed' in sent && sent.sendFailed) {
        this.logger.warn(`注册验证邮件未能送达 ${email}，用户可使用「重发验证邮件」或检查 SMTP`)
      }
    }

    if (process.env.NODE_ENV !== 'production') {
      this.logger.log(`Email verification token for ${email}: ${verificationToken}`)
    }
  }

  async logout(userId: string) {
    // JWT 无状态，客户端删除 token 即可
    // 这里可以添加 token 黑名单逻辑
    console.log(`User ${userId} logged out`)
    return {}
  }
}
