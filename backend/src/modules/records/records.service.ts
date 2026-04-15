import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common'
import { PrismaService } from '@/prisma/prisma.service'
import { GenerationStatus, Prisma } from '@prisma/client'
import type { BatchRecordAction } from './dto/batch-records.dto'

export type RecordsListParams = {
  page?: number
  pageSize?: number
  keyword?: string
  statuses?: string
  dateFrom?: string
  dateTo?: string
  models?: string
  caseBucket?: string
  sources?: string
  sortBy?: 'createdAt' | 'caseCount'
  sortOrder?: 'asc' | 'desc'
  recycle?: string
}

function splitCsv(s?: string): string[] | undefined {
  if (!s?.trim()) return undefined
  const parts = s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)
  return parts.length ? parts : undefined
}

@Injectable()
export class RecordsService {
  constructor(private prisma: PrismaService) {}

  private assertOwner(record: { creatorId: string }, userId: string) {
    if (record.creatorId !== userId) throw new ForbiddenException('无权操作该记录')
  }

  private buildWhere(userId: string, p: RecordsListParams): Prisma.GenerationRecordWhereInput {
    const recycleOnly = p.recycle === '1' || p.recycle === 'true'
    const ands: Prisma.GenerationRecordWhereInput[] = [{ creatorId: userId }]

    if (recycleOnly) {
      ands.push({ deletedAt: { not: null } })
    } else {
      ands.push({ deletedAt: null })
    }

    const st = splitCsv(p.statuses)
    if (st?.length) {
      ands.push({ status: { in: st as GenerationStatus[] } })
    }

    const kw = p.keyword?.trim()
    if (kw) {
      ands.push({
        OR: [
          { title: { contains: kw, mode: 'insensitive' } },
          { prompt: { contains: kw, mode: 'insensitive' } },
          { errorMessage: { contains: kw, mode: 'insensitive' } },
          { suite: { name: { contains: kw, mode: 'insensitive' } } },
        ],
      })
    }

    const df = p.dateFrom ? new Date(p.dateFrom) : undefined
    const dt = p.dateTo ? new Date(p.dateTo) : undefined
    if (df || dt) {
      const createdAt: Prisma.DateTimeFilter = {}
      if (df && !Number.isNaN(df.getTime())) createdAt.gte = df
      if (dt && !Number.isNaN(dt.getTime())) {
        const end = new Date(dt)
        end.setHours(23, 59, 59, 999)
        createdAt.lte = end
      }
      if (Object.keys(createdAt).length) ands.push({ createdAt })
    }

    const models = splitCsv(p.models)
    if (models?.length) {
      ands.push({
        OR: [{ modelName: { in: models } }, { modelId: { in: models } }],
      })
    }

    const bucket = p.caseBucket?.trim() || 'all'
    if (bucket === 'zero') ands.push({ caseCount: 0 })
    else if (bucket === 'small') ands.push({ caseCount: { gte: 1, lte: 10 } })
    else if (bucket === 'large') ands.push({ caseCount: { gt: 10 } })

    const sources = splitCsv(p.sources)
    if (sources?.length) {
      const sor: Prisma.GenerationRecordWhereInput[] = []
      for (const s of sources) {
        if (s === 'file') sor.push({ sourceType: 'file' })
        if (s === 'text') sor.push({ sourceType: 'text' })
        if (s === 'template') sor.push({ templateId: { not: null } })
      }
      if (sor.length) ands.push({ OR: sor })
    }

    return { AND: ands }
  }

  async getSummary(userId: string) {
    const whereActive: Prisma.GenerationRecordWhereInput = {
      creatorId: userId,
      deletedAt: null,
    }

    const [
      total,
      success,
      failed,
      processing,
      pending,
      archived,
      cancelled,
    ] = await Promise.all([
      this.prisma.generationRecord.count({ where: whereActive }),
      this.prisma.generationRecord.count({
        where: { ...whereActive, status: GenerationStatus.SUCCESS },
      }),
      this.prisma.generationRecord.count({
        where: { ...whereActive, status: GenerationStatus.FAILED },
      }),
      this.prisma.generationRecord.count({
        where: { ...whereActive, status: GenerationStatus.PROCESSING },
      }),
      this.prisma.generationRecord.count({
        where: { ...whereActive, status: GenerationStatus.PENDING },
      }),
      this.prisma.generationRecord.count({
        where: { ...whereActive, status: GenerationStatus.ARCHIVED },
      }),
      this.prisma.generationRecord.count({
        where: { ...whereActive, status: GenerationStatus.CANCELLED },
      }),
    ])

    const successRate = total ? Math.round((success / total) * 100) : 0
    return {
      total,
      success,
      failed,
      processing,
      pending,
      archived,
      cancelled,
      successRate,
    }
  }

  async getDistinctModels(userId: string) {
    const rows = await this.prisma.generationRecord.findMany({
      where: { creatorId: userId, deletedAt: null },
      distinct: ['modelId'],
      select: { modelId: true, modelName: true },
      orderBy: { modelName: 'asc' },
    })
    return rows
  }

  async getMatchingIds(userId: string, p: RecordsListParams) {
    const where = this.buildWhere(userId, p)
    const take = 500
    const [rows, total] = await Promise.all([
      this.prisma.generationRecord.findMany({
        where,
        select: { id: true },
        take,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.generationRecord.count({ where }),
    ])
    return { ids: rows.map((r) => r.id), total, capped: total > take }
  }

  async getRecords(userId: string, params: RecordsListParams) {
    const page = Math.max(1, Number(params.page) || 1)
    const pageSize = Math.min(100, Math.max(1, Number(params.pageSize) || 10))
    const where = this.buildWhere(userId, params)
    const sortBy = params.sortBy === 'caseCount' ? 'caseCount' : 'createdAt'
    const sortOrder = params.sortOrder === 'asc' ? 'asc' : 'desc'

    const [list, total] = await Promise.all([
      this.prisma.generationRecord.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { [sortBy]: sortOrder },
        include: { creator: { select: { id: true, username: true, email: true } } },
      }),
      this.prisma.generationRecord.count({ where }),
    ])
    return { list, total, page, pageSize }
  }

  async getById(id: string, userId: string) {
    const record = await this.prisma.generationRecord.findUnique({
      where: { id },
      include: {
        creator: { select: { id: true, username: true, email: true } },
        suite: { select: { id: true, name: true } },
      },
    })
    if (!record) throw new NotFoundException('记录不存在')
    this.assertOwner(record, userId)
    return record
  }

  async patch(id: string, userId: string, body: { status?: GenerationStatus }) {
    const record = await this.prisma.generationRecord.findUnique({ where: { id } })
    if (!record) throw new NotFoundException('记录不存在')
    this.assertOwner(record, userId)
    if (record.deletedAt) throw new BadRequestException('已删除记录请从回收站恢复后再操作')
    const data: Prisma.GenerationRecordUpdateInput = {}
    if (body.status !== undefined) data.status = body.status
    if (Object.keys(data).length === 0) return record
    return this.prisma.generationRecord.update({ where: { id }, data })
  }

  /** 软删除（进回收站） */
  async softDelete(id: string, userId: string) {
    const record = await this.prisma.generationRecord.findUnique({ where: { id } })
    if (!record) throw new NotFoundException('记录不存在')
    this.assertOwner(record, userId)
    if (record.deletedAt) return record
    return this.prisma.generationRecord.update({
      where: { id },
      data: { deletedAt: new Date() },
    })
  }

  async restore(id: string, userId: string) {
    const record = await this.prisma.generationRecord.findUnique({ where: { id } })
    if (!record) throw new NotFoundException('记录不存在')
    this.assertOwner(record, userId)
    if (!record.deletedAt) return record
    return this.prisma.generationRecord.update({
      where: { id },
      data: { deletedAt: null },
    })
  }

  /** 仅允许删除已在回收站中的记录 */
  async permanentDelete(id: string, userId: string) {
    const record = await this.prisma.generationRecord.findUnique({ where: { id } })
    if (!record) throw new NotFoundException('记录不存在')
    this.assertOwner(record, userId)
    if (!record.deletedAt) {
      throw new BadRequestException('请先将记录移入回收站后再彻底删除')
    }
    await this.prisma.generationRecord.delete({ where: { id } })
  }

  async batch(userId: string, ids: string[], action: BatchRecordAction) {
    const unique = [...new Set(ids)].filter(Boolean)
    if (!unique.length) throw new BadRequestException('请选择记录')

    const records = await this.prisma.generationRecord.findMany({
      where: { id: { in: unique }, creatorId: userId },
    })
    const allowedIds = records.map((r) => r.id)
    if (!allowedIds.length) throw new BadRequestException('没有可操作的记录')

    switch (action) {
      case 'SOFT_DELETE': {
        await this.prisma.generationRecord.updateMany({
          where: { id: { in: allowedIds }, creatorId: userId, deletedAt: null },
          data: { deletedAt: new Date() },
        })
        break
      }
      case 'RESTORE': {
        await this.prisma.generationRecord.updateMany({
          where: { id: { in: allowedIds }, creatorId: userId, deletedAt: { not: null } },
          data: { deletedAt: null },
        })
        break
      }
      case 'ARCHIVE': {
        await this.prisma.generationRecord.updateMany({
          where: { id: { in: allowedIds }, creatorId: userId, deletedAt: null },
          data: { status: GenerationStatus.ARCHIVED },
        })
        break
      }
      case 'CANCEL': {
        await this.prisma.generationRecord.updateMany({
          where: { id: { in: allowedIds }, creatorId: userId, deletedAt: null },
          data: { status: GenerationStatus.CANCELLED },
        })
        break
      }
      case 'PERMANENT_DELETE': {
        const inBin = records.filter((r) => r.deletedAt && allowedIds.includes(r.id))
        if (inBin.length !== allowedIds.length) {
          throw new BadRequestException('仅回收站中的记录可彻底删除')
        }
        await this.prisma.generationRecord.deleteMany({
          where: { id: { in: allowedIds }, creatorId: userId },
        })
        break
      }
      default:
        throw new BadRequestException('不支持的操作')
    }

    return { ok: true, affected: allowedIds.length }
  }
}
