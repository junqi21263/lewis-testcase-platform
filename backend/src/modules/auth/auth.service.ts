import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import * as bcrypt from 'bcryptjs'
import { PrismaService } from '@/prisma/prisma.service'
import { LoginDto, RegisterDto, ChangePasswordDto } from './dto/auth.dto'

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
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
    const exists = await this.prisma.user.findUnique({ where: { email: dto.email } })
    if (exists) throw new ConflictException('该邮箱已被注册')

    const hashed = await bcrypt.hash(dto.password, 10)
    const user = await this.prisma.user.create({
      data: { email: dto.email, username: dto.username, password: hashed },
      select: { id: true, email: true, username: true, role: true, avatar: true, createdAt: true },
    })

    const token = this.jwtService.sign({ sub: user.id, email: user.email, role: user.role })
    return { accessToken: token, user }
  }

  async getProfile(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, username: true, role: true, avatar: true, teamId: true, createdAt: true, updatedAt: true },
    })
  }

  async updateProfile(userId: string, data: { username?: string; avatar?: string }) {
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

    const hashed = await bcrypt.hash(dto.newPassword, 10)
    await this.prisma.user.update({ where: { id: userId }, data: { password: hashed } })
  }
}
