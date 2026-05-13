import { Injectable } from '@nestjs/common'
import { PrismaService } from '@/prisma/prisma.service'

@Injectable()
export class UsageService {
  constructor(private readonly prisma: PrismaService) {}

  private dayStart() {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), now.getDate())
  }

  private monthStart() {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  }

  async summary(userId: string) {
    const [today, month, byFileKind, byModule] = await Promise.all([
      (this.prisma as any).multimodalUsageRecord.aggregate({
        where: { userId, createdAt: { gte: this.dayStart() } },
        _count: { _all: true },
        _sum: { totalTokens: true, estimatedCostCny: true },
      }),
      (this.prisma as any).multimodalUsageRecord.aggregate({
        where: { userId, createdAt: { gte: this.monthStart() } },
        _count: { _all: true },
        _sum: { totalTokens: true, estimatedCostCny: true },
      }),
      (this.prisma as any).multimodalUsageRecord.groupBy({
        by: ['fileKind'],
        where: { userId, createdAt: { gte: this.monthStart() } },
        _count: { _all: true },
      }),
      (this.prisma as any).multimodalUsageRecord.groupBy({
        by: ['moduleType'],
        where: { userId, createdAt: { gte: this.monthStart() } },
        _count: { _all: true },
      }),
    ])
    return {
      today: {
        calls: today?._count?._all ?? 0,
        tokens: today?._sum?.totalTokens ?? 0,
        costCny: Number(today?._sum?.estimatedCostCny ?? 0),
      },
      month: {
        calls: month?._count?._all ?? 0,
        tokens: month?._sum?.totalTokens ?? 0,
        costCny: Number(month?._sum?.estimatedCostCny ?? 0),
      },
      fileTypeDistribution: byFileKind.map((x: any) => ({
        fileKind: x.fileKind,
        count: x._count?._all ?? 0,
      })),
      moduleDistribution: byModule.map((x: any) => ({
        moduleType: x.moduleType,
        count: x._count?._all ?? 0,
      })),
    }
  }

  async details(userId: string, page = 1, pageSize = 20) {
    const p = Math.max(1, page)
    const ps = Math.min(200, Math.max(1, pageSize))
    const [list, total] = await Promise.all([
      (this.prisma as any).multimodalUsageRecord.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip: (p - 1) * ps,
        take: ps,
      }),
      (this.prisma as any).multimodalUsageRecord.count({ where: { userId } }),
    ])
    return { list, total, page: p, pageSize: ps }
  }

  async exportCsv(userId: string) {
    const rows = await (this.prisma as any).multimodalUsageRecord.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 5000,
    })
    const header = [
      'createdAt',
      'moduleType',
      'fileKind',
      'provider',
      'modelName',
      'promptTokens',
      'completionTokens',
      'totalTokens',
      'estimatedCostCny',
      'cacheHit',
      'success',
      'errorMessage',
    ]
    const csvLines = [
      header.join(','),
      ...rows.map((r: any) =>
        [
          r.createdAt?.toISOString?.() ?? '',
          r.moduleType ?? '',
          r.fileKind ?? '',
          r.provider ?? '',
          r.modelName ?? '',
          r.promptTokens ?? 0,
          r.completionTokens ?? 0,
          r.totalTokens ?? 0,
          r.estimatedCostCny ?? 0,
          r.cacheHit ? '1' : '0',
          r.success ? '1' : '0',
          `"${String(r.errorMessage ?? '').replace(/"/g, '""')}"`,
        ].join(','),
      ),
    ]
    return csvLines.join('\n')
  }
}
