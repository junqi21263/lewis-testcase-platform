import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import * as bcrypt from 'bcrypt'
import { PrismaService } from '@/prisma/prisma.service'
import { LoginDto, RegisterDto, ChangePasswordDto, ForgotPasswordDto, ResetPasswordDto, VerifyEmailDto } from './dto/auth.dto'
import { PasswordValidator } from '@/common/validators/password.validator'

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private passwordValidator: PasswordValidator,
  ) {}

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } })
    if (!user) throw new UnauthorizedException('邮箱或密码错误')

    const isMatch = await bcrypt.compare(dto.password, user.password)
    if (!isMatch) throw new UnauthorizedException('邮箱或密码错误')

    const token = this.jwtService.sign({ sub: user.id, email: user.email, role: user.role })
    const { password: _, ...userInfo } = user

    return { accessToken: token, user: userInfo }
  }

  async register(dto: RegisterDto) {
    // 检查邮箱是否已存在
    const exists = await this.prisma.user.findUnique({ where: { email: dto.email } })
    if (exists) throw new ConflictException('该邮箱已被注册')

    // 检查用户名是否已存在
    const usernameExists = await this.prisma.user.findFirst({ where: { username: dto.username } })
    if (usernameExists) throw new ConflictException('该用户名已被使用')

    // 验证密码强度
    const passwordValidation = this.passwordValidator.validate(dto.password)
    if (!passwordValidation.valid) {
      throw new BadRequestException(`密码强度不足: ${passwordValidation.errors.join(', ')}`)
    }

    // 生成密码哈希
    const hashed = await bcrypt.hash(dto.password, 10)
    
    // 创建用户
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        username: dto.username,
        password: hashed,
        avatar: dto.avatar,
      },
      select: { id: true, email: true, username: true, role: true, avatar: true, createdAt: true },
    })

    // 生成验证令牌
    const verificationToken = this.jwtService.sign(
      { sub: user.id, email: user.email },
      { expiresIn: this.passwordValidator.verificationTokenExpiry }
    )

    // 这里可以添加发送验证邮件的逻辑
    console.log(`Verification token for ${user.email}: ${verificationToken}`)

    const token = this.jwtService.sign({ sub: user.id, email: user.email, role: user.role })
    return { accessToken: token, user, verificationToken }
  }

  async getProfile(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, username: true, role: true, avatar: true, teamId: true, createdAt: true, updatedAt: true },
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
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } })
    if (!user) throw new NotFoundException('用户不存在')

    // 生成重置令牌
    const resetToken = this.jwtService.sign(
      { sub: user.id, email: user.email },
      { expiresIn: '1h' }
    )

    // 这里可以添加发送重置邮件的逻辑
    console.log(`Password reset token for ${user.email}: ${resetToken}`)

    return { resetToken }
  }

  async resetPassword(dto: ResetPasswordDto) {
    try {
      // 验证重置令牌
      const payload = this.jwtService.verify(dto.token)
      const user = await this.prisma.user.findFirst({
        where: { id: payload.sub, email: payload.email },
      })

      if (!user) throw new BadRequestException('无效的重置令牌')

      const hashed = await bcrypt.hash(dto.newPassword, 10)
      await this.prisma.user.update({ where: { id: user.id }, data: { password: hashed } })

      return { message: '密码重置成功' }
    } catch (error) {
      throw new BadRequestException('无效的重置令牌或已过期')
    }
  }

  async verifyEmail(dto: VerifyEmailDto) {
    try {
      // 验证邮箱令牌
      const payload = this.jwtService.verify(dto.token)
      const user = await this.prisma.user.findFirst({
        where: { id: payload.sub, email: payload.email },
      })

      if (!user) throw new BadRequestException('无效的验证令牌')

      // 生产 schema 暂无 emailVerified 字段；校验令牌后即视为通过
      return { message: '邮箱验证成功' }
    } catch (error) {
      throw new BadRequestException('无效的验证令牌或已过期')
    }
  }

  async logout(userId: string) {
    // JWT 无状态，客户端删除 token 即可
    // 这里可以添加 token 黑名单逻辑
    console.log(`User ${userId} logged out`)
    return { message: '已退出登录' }
  }
}