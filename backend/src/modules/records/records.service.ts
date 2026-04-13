import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '@/prisma/prisma.service'

@Injectable()
export class RecordsService {
  constructor(private prisma: PrismaService) {}

  async getSummary(userId: string) {
    const where = { creatorId: userId }

    const [total, success, failed, processing, pending] = await Promise.all([
      this.prisma.generationRecord.count({ where }),
      this.prisma.generationRecord.count({ where: { ...where, status: 'SUCCESS' as any } }),
      this.prisma.generationRecord.count({ where: { ...where, status: 'FAILED' as any } }),
      this.prisma.generationRecord.count({ where: { ...where, status: 'PROCESSING' as any } }),
      this.prisma.generationRecord.count({ where: { ...where, status: 'PENDING' as any } }),
    ])

    const successRate = total ? Math.round((success / total) * 100) : 0
    return { total, success, failed, processing, pending, successRate }
  }

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

  async delete(id: string, _userId: string) {
    const record = await this.prisma.generationRecord.findUnique({ where: { id } })
    if (!record) throw new NotFoundException('记录不存在')
    await this.prisma.generationRecord.delete({ where: { id } })
  }
}
