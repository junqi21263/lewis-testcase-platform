import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '@/prisma/prisma.service'

@Injectable()
export class RecordsService {
  constructor(private prisma: PrismaService) {}

  async getRecords(userId: string, params: { page?: number; pageSize?: number; status?: string; keyword?: string }) {
    const { page = 1, pageSize = 10, status, keyword } = params
    const where = {
      creatorId: userId,
      ...(status ? { status: status as any } : {}),
      ...(keyword ? { title: { contains: keyword, mode: 'insensitive' as const } } : {}),
    }
    const [list, total] = await Promise.all([
      this.prisma.generationRecord.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: { creator: { select: { id: true, username: true } } },
      }),
      this.prisma.generationRecord.count({ where }),
    ])
    return { list, total, page, pageSize }
  }

  async getById(id: string) {
    const record = await this.prisma.generationRecord.findUnique({
      where: { id },
      include: { creator: { select: { id: true, username: true } } },
    })
    if (!record) throw new NotFoundException('记录不存在')
    return record
  }

  async delete(id: string, userId: string) {
    const record = await this.prisma.generationRecord.findUnique({ where: { id } })
    if (!record) throw new NotFoundException('记录不存在')
    await this.prisma.generationRecord.delete({ where: { id } })
  }
}
