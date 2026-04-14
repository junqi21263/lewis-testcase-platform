import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common'
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

  async getRecords(userId: string, params: {
    page?: number
    pageSize?: number
    status?: string
    keyword?: string
    modelId?: string
    from?: string
    to?: string
    minCaseCount?: number
    maxCaseCount?: number
  }) {
    const { page = 1, pageSize = 10, status, keyword, modelId, from, to, minCaseCount, maxCaseCount } = params
    const createdAt: any = {}
    if (from) createdAt.gte = new Date(from)
    if (to) createdAt.lte = new Date(to)
    const where = {
      creatorId: userId,
      ...(status ? { status: status as any } : {}),
      ...(keyword ? { title: { contains: keyword, mode: 'insensitive' as const } } : {}),
      ...(modelId ? { modelId } : {}),
      ...(Object.keys(createdAt).length ? { createdAt } : {}),
      ...(typeof minCaseCount === 'number' ? { caseCount: { gte: minCaseCount } } : {}),
      ...(typeof maxCaseCount === 'number' ? { caseCount: { lte: maxCaseCount } } : {}),
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

  async getByIdForUser(id: string, userId: string) {
    const record = await this.getById(id)
    if (record.creatorId !== userId) throw new ForbiddenException('无权访问该记录')
    return record
  }

  async delete(id: string, userId: string) {
    const record = await this.prisma.generationRecord.findUnique({ where: { id } })
    if (!record) throw new NotFoundException('记录不存在')
    if (record.creatorId !== userId) throw new ForbiddenException('无权删除该记录')
    await this.prisma.generationRecord.delete({ where: { id } })
  }

  async batchDelete(ids: string[], userId: string) {
    if (!ids?.length) return { deleted: 0 }
    const res = await this.prisma.generationRecord.deleteMany({
      where: { id: { in: ids }, creatorId: userId },
    })
    return { deleted: res.count }
  }

  async getResult(id: string, userId: string) {
    const record = await this.getByIdForUser(id, userId)
    if (!record.suiteId) {
      return {
        record,
        suite: null,
        cases: [],
        stats: {
          total: 0,
          byPriority: {},
          byType: {},
        },
      }
    }

    const suite = await this.prisma.testSuite.findUnique({
      where: { id: record.suiteId },
      include: {
        creator: { select: { id: true, username: true } },
      },
    })
    if (!suite) throw new NotFoundException('用例集不存在')
    if (suite.creatorId !== userId) throw new ForbiddenException('无权访问该用例集')

    const cases = await this.prisma.testCase.findMany({
      where: { suiteId: suite.id },
      orderBy: { createdAt: 'asc' },
    })

    const byPriority: Record<string, number> = {}
    const byType: Record<string, number> = {}
    for (const c of cases as any[]) {
      const p = String(c.priority || 'P2')
      byPriority[p] = (byPriority[p] || 0) + 1
      const t = String(c.type || 'FUNCTIONAL')
      byType[t] = (byType[t] || 0) + 1
    }

    return {
      record,
      suite,
      cases,
      stats: {
        total: cases.length,
        byPriority,
        byType,
      },
    }
  }
}
