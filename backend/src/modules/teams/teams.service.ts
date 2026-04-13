import { Injectable, NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common'
import { PrismaService } from '@/prisma/prisma.service'
import { UserRole } from '@prisma/client'

@Injectable()
export class TeamsService {
  constructor(private prisma: PrismaService) {}

  async getTeams(userId: string, page = 1, pageSize = 10) {
    const where = { members: { some: { userId } } }
    const [list, total] = await Promise.all([
      this.prisma.team.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { _count: { select: { members: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.team.count({ where }),
    ])
    return {
      list: list.map((t) => ({ ...t, memberCount: t._count.members, _count: undefined })),
      total, page, pageSize,
    }
  }

  async getById(id: string) {
    const team = await this.prisma.team.findUnique({ where: { id } })
    if (!team) throw new NotFoundException('团队不存在')
    return team
  }

  async create(userId: string, data: { name: string; description?: string }) {
    return this.prisma.team.create({
      data: {
        ...data,
        ownerId: userId,
        members: { create: { userId, role: UserRole.SUPER_ADMIN } },
      },
    })
  }

  async update(id: string, userId: string, data: any) {
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

  async getMembers(teamId: string) {
    return this.prisma.teamMember.findMany({
      where: { teamId },
      include: { user: { select: { id: true, email: true, username: true, avatar: true, role: true } } },
      orderBy: { joinedAt: 'asc' },
    })
  }

  async inviteMember(teamId: string, data: { email: string; role: string }) {
    const user = await this.prisma.user.findUnique({ where: { email: data.email } })
    if (!user) throw new NotFoundException('该邮箱用户不存在')

    const exists = await this.prisma.teamMember.findUnique({ where: { userId_teamId: { userId: user.id, teamId } } })
    if (exists) throw new ConflictException('该用户已在团队中')

    return this.prisma.teamMember.create({
      data: { userId: user.id, teamId, role: data.role as UserRole },
      include: { user: { select: { id: true, email: true, username: true } } },
    })
  }

  async removeMember(_teamId: string, memberId: string) {
    const member = await this.prisma.teamMember.findUnique({ where: { id: memberId } })
    if (!member) throw new NotFoundException('成员不存在')
    await this.prisma.teamMember.delete({ where: { id: memberId } })
  }

  async updateMemberRole(_teamId: string, memberId: string, role: UserRole) {
    return this.prisma.teamMember.update({ where: { id: memberId }, data: { role } })
  }
}
