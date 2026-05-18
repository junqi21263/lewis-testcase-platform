import { Injectable, NotFoundException, ForbiddenException, ConflictException, BadRequestException } from '@nestjs/common'
import { PrismaService } from '@/prisma/prisma.service'
import { UserRole } from '@prisma/client'
import type { CreateTeamDto } from './dto/create-team.dto'
import type { UpdateTeamDto } from './dto/update-team.dto'
import type { InviteMemberDto } from './dto/invite-member.dto'

@Injectable()
export class TeamsService {
  constructor(private prisma: PrismaService) {}

  private canManageTeam(role?: UserRole) {
    return role === UserRole.SUPER_ADMIN || role === UserRole.ADMIN
  }

  private async getTeamWithAccess(teamId: string, userId: string) {
    const team = await this.prisma.team.findUnique({ where: { id: teamId } })
    if (!team) throw new NotFoundException('团队不存在')
    const member = await this.prisma.teamMember.findUnique({
      where: { userId_teamId: { userId, teamId } },
    })
    if (!member && team.ownerId !== userId) {
      throw new ForbiddenException('无权访问该团队')
    }
    return { team, member }
  }

  private async assertCanManageTeam(teamId: string, userId: string) {
    const { team, member } = await this.getTeamWithAccess(teamId, userId)
    if (team.ownerId === userId) return team
    if (!this.canManageTeam(member?.role)) {
      throw new ForbiddenException('仅团队管理员可执行此操作')
    }
    return team
  }

  async getTeams(userId: string, page = 1, pageSize = 10) {
    const p = Math.max(1, Number(page) || 1)
    const ps = Math.min(100, Math.max(1, Number(pageSize) || 10))
    const where = { members: { some: { userId } } }
    const [list, total] = await Promise.all([
      this.prisma.team.findMany({
        where,
        skip: (p - 1) * ps,
        take: ps,
        include: { _count: { select: { members: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.team.count({ where }),
    ])
    return {
      list: list.map((t) => ({ ...t, memberCount: t._count.members, _count: undefined })),
      total, page: p, pageSize: ps,
    }
  }

  async getById(id: string, userId: string) {
    const { team } = await this.getTeamWithAccess(id, userId)
    return team
  }

  async create(userId: string, data: CreateTeamDto) {
    return this.prisma.team.create({
      data: {
        ...data,
        ownerId: userId,
        members: { create: { userId, role: UserRole.SUPER_ADMIN } },
      },
    })
  }

  async update(id: string, userId: string, data: UpdateTeamDto) {
    const team = await this.prisma.team.findUnique({ where: { id } })
    if (!team) throw new NotFoundException('团队不存在')
    if (team.ownerId !== userId) throw new ForbiddenException('只有团队拥有者可以修改团队')
    return this.prisma.team.update({ where: { id }, data })
  }

  async delete(id: string, userId: string) {
    const team = await this.prisma.team.findUnique({ where: { id } })
    if (!team) throw new NotFoundException('团队不存在')
    if (team.ownerId !== userId) throw new ForbiddenException('只有团队拥有者可以解散团队')
    await this.prisma.team.delete({ where: { id } })
  }

  async getMembers(teamId: string, userId: string) {
    await this.getTeamWithAccess(teamId, userId)
    return this.prisma.teamMember.findMany({
      where: { teamId },
      include: { user: { select: { id: true, email: true, username: true, avatar: true, role: true } } },
      orderBy: { joinedAt: 'asc' },
    })
  }

  async inviteMember(teamId: string, userId: string, data: InviteMemberDto) {
    await this.assertCanManageTeam(teamId, userId)
    const user = await this.prisma.user.findUnique({ where: { email: data.email } })
    if (!user) throw new NotFoundException('该邮箱用户不存在')

    const exists = await this.prisma.teamMember.findUnique({ where: { userId_teamId: { userId: user.id, teamId } } })
    if (exists) throw new ConflictException('该用户已在团队中')
    if (data.role === UserRole.SUPER_ADMIN) {
      throw new BadRequestException('不可通过邀请直接授予 SUPER_ADMIN')
    }

    return this.prisma.teamMember.create({
      data: { userId: user.id, teamId, role: data.role as UserRole },
      include: { user: { select: { id: true, email: true, username: true } } },
    })
  }

  async removeMember(teamId: string, memberId: string, userId: string) {
    await this.assertCanManageTeam(teamId, userId)
    const member = await this.prisma.teamMember.findUnique({ where: { id: memberId } })
    if (!member) throw new NotFoundException('成员不存在')
    if (member.teamId !== teamId) throw new ForbiddenException('无权操作该成员')
    const team = await this.prisma.team.findUnique({ where: { id: teamId } })
    if (team?.ownerId === member.userId) {
      throw new BadRequestException('不可移除团队拥有者')
    }
    await this.prisma.teamMember.delete({ where: { id: memberId } })
  }

  async updateMemberRole(teamId: string, memberId: string, userId: string, role: UserRole) {
    await this.assertCanManageTeam(teamId, userId)
    if (role === UserRole.SUPER_ADMIN) {
      throw new BadRequestException('不可设置为 SUPER_ADMIN')
    }
    const member = await this.prisma.teamMember.findUnique({ where: { id: memberId } })
    if (!member) throw new NotFoundException('成员不存在')
    if (member.teamId !== teamId) throw new ForbiddenException('无权操作该成员')
    const team = await this.prisma.team.findUnique({ where: { id: teamId } })
    if (team?.ownerId === member.userId) {
      throw new BadRequestException('团队拥有者角色不可修改')
    }
    return this.prisma.teamMember.update({ where: { id: memberId }, data: { role } })
  }
}
