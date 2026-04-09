import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common'
import { PrismaService } from '@/prisma/prisma.service'

@Injectable()
export class TemplatesService {
  constructor(private prisma: PrismaService) {}

  async getTemplates(userId: string, params: { page?: number; pageSize?: number; category?: string; keyword?: string }) {
    const { page = 1, pageSize = 20, category, keyword } = params
    const where = {
      OR: [{ creatorId: userId }, { isPublic: true }],
      ...(category ? { category: category as any } : {}),
      ...(keyword ? { name: { contains: keyword, mode: 'insensitive' as const } } : {}),
    }
    const [list, total] = await Promise.all([
      this.prisma.promptTemplate.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { usageCount: 'desc' },
        include: { creator: { select: { id: true, username: true } } },
      }),
      this.prisma.promptTemplate.count({ where }),
    ])
    return { list, total, page, pageSize }
  }

  async getById(id: string) {
    const tpl = await this.prisma.promptTemplate.findUnique({ where: { id } })
    if (!tpl) throw new NotFoundException('模板不存在')
    return tpl
  }

  async create(userId: string, data: any) {
    return this.prisma.promptTemplate.create({
      data: { ...data, creatorId: userId, variables: data.variables || [] },
    })
  }

  async update(id: string, userId: string, data: any) {
    const tpl = await this.prisma.promptTemplate.findUnique({ where: { id } })
    if (!tpl) throw new NotFoundException('模板不存在')
    if (tpl.creatorId !== userId) throw new ForbiddenException('无权修改该模板')
    return this.prisma.promptTemplate.update({ where: { id }, data })
  }

  async delete(id: string, userId: string) {
    const tpl = await this.prisma.promptTemplate.findUnique({ where: { id } })
    if (!tpl) throw new NotFoundException('模板不存在')
    if (tpl.creatorId !== userId) throw new ForbiddenException('无权删除该模板')
    await this.prisma.promptTemplate.delete({ where: { id } })
  }
}
