import {
  Injectable,
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

const JWT_PURPOSE_VERIFY_EMAIL = 'verify_email' as const
const JWT_PURPOSE_RESET_PASSWORD = 'reset_password' as const

type JwtAuthPayload = { sub: string; email: string; purpose?: string }

@Injectable()
export class AuthService {
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

    await this.sendVerificationEmail(user.id, user.email)

    return {
      message: '注册成功，验证邮件已发送，请查收邮箱完成验证后再登录',
      data: { email: user.email, needsEmailVerification: true as const },
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
      const frontend = (this.config.get<string>('FRONTEND_URL') || '').trim().replace(/\/+$/, '')
      const resetUrl = frontend ? `${frontend}/reset-password/${encodeURIComponent(resetToken)}` : ''

      // 邮件发送（若 SMTP 未配置则跳过；开发环境仍会输出 token 便于调试）
      if (resetUrl) {
        await this.mail.sendMail({
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
      await this.sendVerificationEmail(user.id, user.email)
    }
    return {}
  }

  private async sendVerificationEmail(userId: string, email: string) {
    const verificationToken = this.jwtService.sign(
      { sub: userId, email, purpose: JWT_PURPOSE_VERIFY_EMAIL },
      { expiresIn: this.passwordValidator.verificationTokenExpiry },
    )
    const frontend = (this.config.get<string>('FRONTEND_URL') || '').trim().replace(/\/+$/, '')
    const q = new URLSearchParams({
      token: verificationToken,
      email,
    })
    const verifyUrl = frontend ? `${frontend}/verify-email?${q.toString()}` : ''

    if (verifyUrl) {
      await this.mail.sendMail({
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
    }

    if (process.env.NODE_ENV !== 'production') {
      console.log(`Email verification token for ${email}: ${verificationToken}`)
    }
  }

  async logout(userId: string) {
    // JWT 无状态，客户端删除 token 即可
    // 这里可以添加 token 黑名单逻辑
    console.log(`User ${userId} logged out`)
    return {}
  }
}
