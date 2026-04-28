import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { UserRole } from '@prisma/client'
import * as bcrypt from 'bcryptjs'
import { ADMIN_AUDIT_ACTION } from './admin.constants'

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  private clipIp(ip?: string | null): string | null {
    if (!ip || !ip.trim()) return null
    const s = ip.trim()
    return s.length > 64 ? s.slice(0, 64) : s
  }

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

  async listAuditLogs(params: { take: number; skip: number }) {
    const { take, skip } = params
    const [total, list] = await Promise.all([
      this.prisma.adminAuditLog.count(),
      this.prisma.adminAuditLog.findMany({
        take,
        skip,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          action: true,
          detail: true,
          ip: true,
          createdAt: true,
          operator: { select: { id: true, username: true } },
          targetUser: { select: { id: true, username: true } },
        },
      }),
    ])
    return { total, list }
  }

  async resetUserPassword(userId: string, newPassword: string, operatorId: string, ip?: string) {
    if (!newPassword || newPassword.length < 8) throw new BadRequestException('Password too short')
    const user = await this.prisma.user.findUnique({ where: { id: userId } })
    if (!user) throw new NotFoundException('User not found')
    const hashed = await bcrypt.hash(newPassword, 10)
    const clip = this.clipIp(ip)
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { password: hashed } })
      await tx.adminAuditLog.create({
        data: {
          operatorId,
          targetUserId: userId,
          action: ADMIN_AUDIT_ACTION.RESET_PASSWORD,
          ip: clip,
          detail: { targetUsername: user.username },
        },
      })
    })
    return { ok: true }
  }

  async updateUserRole(userId: string, role: UserRole, operatorId: string, ip?: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } })
    if (!user) throw new NotFoundException('User not found')
    const fromRole = user.role
    const clip = this.clipIp(ip)
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { role } })
      await tx.adminAuditLog.create({
        data: {
          operatorId,
          targetUserId: userId,
          action: ADMIN_AUDIT_ACTION.UPDATE_ROLE,
          ip: clip,
          detail: {
            targetUsername: user.username,
            fromRole,
            toRole: role,
          },
        },
      })
    })
    return { ok: true }
  }
}

