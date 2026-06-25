import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { UserRole } from '@prisma/client'
import * as bcrypt from 'bcryptjs'
import { createHash, randomBytes } from 'node:crypto'
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

  private hashInviteCode(code: string) {
    return createHash('sha256').update(code.trim()).digest('hex')
  }

  private generateInviteCode() {
    return randomBytes(6).toString('base64url')
  }

  async listInviteCodes(params: { take: number; skip: number }) {
    const { take, skip } = params
    const [total, list] = await Promise.all([
      this.prisma.inviteCode.count(),
      this.prisma.inviteCode.findMany({
        take,
        skip,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          codeHash: true,
          status: true,
          maxUses: true,
          usedCount: true,
          expiresAt: true,
          lastUsedAt: true,
          remark: true,
          createdAt: true,
          updatedAt: true,
          createdBy: { select: { id: true, username: true } },
        },
      }),
    ])
    return {
      total,
      list: list.map(({ codeHash, ...item }) => ({
        ...item,
        codeFingerprint: codeHash.slice(-8),
      })),
    }
  }

  async createInviteCode(
    data: { code?: string; maxUses?: number; expiresAt?: string; remark?: string },
    operatorId: string,
    ip?: string,
  ) {
    const code = (data.code?.trim() || this.generateInviteCode()).trim()
    if (code.length < 4 || code.length > 64) throw new BadRequestException('邀请码长度需为 4-64 个字符')
    const codeHash = this.hashInviteCode(code)
    const exists = await this.prisma.inviteCode.findUnique({ where: { codeHash } })
    if (exists) throw new BadRequestException('邀请码已存在，请更换后重试')
    const expiresAt = data.expiresAt ? new Date(data.expiresAt) : null
    if (expiresAt && Number.isNaN(expiresAt.getTime())) throw new BadRequestException('过期时间格式不正确')
    const clip = this.clipIp(ip)
    const created = await this.prisma.$transaction(async (tx) => {
      const row = await tx.inviteCode.create({
        data: {
          codeHash,
          status: 'ACTIVE',
          maxUses: data.maxUses ?? null,
          expiresAt,
          remark: data.remark?.trim() || null,
          createdById: operatorId,
        },
      })
      await tx.adminAuditLog.create({
        data: {
          operatorId,
          targetUserId: operatorId,
          action: ADMIN_AUDIT_ACTION.INVITE_CODE_CREATE,
          ip: clip,
          detail: {
            inviteCodeId: row.id,
            codeFingerprint: row.codeHash.slice(-8),
            maxUses: row.maxUses,
            expiresAt: row.expiresAt,
          },
        },
      })
      return row
    })
    return {
      id: created.id,
      code,
      status: created.status,
      maxUses: created.maxUses,
      usedCount: created.usedCount,
      expiresAt: created.expiresAt,
      codeFingerprint: created.codeHash.slice(-8),
    }
  }

  async updateInviteCodeStatus(id: string, status: 'ACTIVE' | 'DISABLED', operatorId: string, ip?: string) {
    const current = await this.prisma.inviteCode.findUnique({ where: { id } })
    if (!current) throw new NotFoundException('Invite code not found')
    const clip = this.clipIp(ip)
    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.inviteCode.update({ where: { id }, data: { status } })
      await tx.adminAuditLog.create({
        data: {
          operatorId,
          targetUserId: operatorId,
          action: ADMIN_AUDIT_ACTION.INVITE_CODE_STATUS_UPDATE,
          ip: clip,
          detail: {
            inviteCodeId: id,
            codeFingerprint: current.codeHash.slice(-8),
            fromStatus: current.status,
            toStatus: status,
          },
        },
      })
      return row
    })
    return {
      id: updated.id,
      status: updated.status,
      maxUses: updated.maxUses,
      usedCount: updated.usedCount,
      expiresAt: updated.expiresAt,
      codeFingerprint: updated.codeHash.slice(-8),
    }
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
