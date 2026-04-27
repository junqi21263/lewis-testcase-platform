import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { UserRole } from '@prisma/client'
import * as bcrypt from 'bcryptjs'

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async listUsers(params: { keyword?: string; take: number; skip: number }) {
    const { keyword, take, skip } = params
    const where =
      keyword && keyword.trim()
        ? {
            OR: [
              { email: { contains: keyword.trim(), mode: 'insensitive' as const } },
              { username: { contains: keyword.trim(), mode: 'insensitive' as const } },
            ],
          }
        : {}

    const [total, list] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        take,
        skip,
        orderBy: { updatedAt: 'desc' },
        select: {
          id: true,
          email: true,
          username: true,
          role: true,
          teamId: true,
          emailVerified: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
    ])

    return { total, list }
  }

  async resetUserPassword(userId: string, newPassword: string) {
    if (!newPassword || newPassword.length < 8) throw new BadRequestException('Password too short')
    const user = await this.prisma.user.findUnique({ where: { id: userId } })
    if (!user) throw new NotFoundException('User not found')
    const hashed = await bcrypt.hash(newPassword, 10)
    await this.prisma.user.update({ where: { id: userId }, data: { password: hashed } })
    return { ok: true }
  }

  async updateUserRole(userId: string, role: UserRole) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } })
    if (!user) throw new NotFoundException('User not found')
    await this.prisma.user.update({ where: { id: userId }, data: { role } })
    return { ok: true }
  }
}

