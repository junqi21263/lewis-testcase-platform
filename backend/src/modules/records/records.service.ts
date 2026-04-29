import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  HttpException,
  HttpStatus,
} from '@nestjs/common'
import { randomBytes } from 'crypto'
import { PrismaService } from '@/prisma/prisma.service'
import { GenerationSource, GenerationStatus, Prisma, UserRole } from '@prisma/client'
import type { BatchRecordAction } from './dto/batch-records.dto'
import type { UpdateGenerationRecordDto } from './dto/update-generation-record.dto'
import type { CreateRecordShareDto } from './dto/create-record-share.dto'
import type { SessionUser } from './records.types'
import { maskSensitivePlainText } from '@/common/utils/sensitive-mask'
import { TestcasesService } from '@/modules/testcases/testcases.service'

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
  /** 仅 SUPER_ADMIN 跨团队筛选时传递 */
  filterTeamId?: string
  caseCountMin?: string
  caseCountMax?: string
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
  constructor(
    private prisma: PrismaService,
    private testcases: TestcasesService,
  ) {}

  /** 数据范围：本人；团队 ADMIN/SUPER_ADMIN 可见本团队记录 */
  private buildAccessScope(user: SessionUser): Prisma.GenerationRecordWhereInput {
    if (
      user.teamId &&
      (user.role === UserRole.ADMIN || user.role === UserRole.SUPER_ADMIN)
    ) {
      return {
        OR: [{ creatorId: user.id }, { teamId: user.teamId }],
      }
    }
    return { creatorId: user.id }
  }

  private assertCanAccess(
    record: { creatorId: string; teamId: string | null },
    user: SessionUser,
  ) {
    if (record.creatorId === user.id) return
    if (
      user.teamId &&
      record.teamId === user.teamId &&
      (user.role === UserRole.ADMIN || user.role === UserRole.SUPER_ADMIN)
    ) {
      return
    }
    throw new ForbiddenException('无权操作该记录')
  }

  private assertCanMutate(user: SessionUser) {
    if (user.role === UserRole.VIEWER) {
      throw new ForbiddenException('只读用户不可执行此操作')
    }
  }

  private maskTexts<T extends Record<string, unknown>>(row: T, keys: (keyof T)[]): T {
    const out = { ...row }
    for (const k of keys) {
      const v = out[k]
      if (typeof v === 'string' && v.length) {
        (out as Record<string, unknown>)[k as string] = maskSensitivePlainText(v)
      }
    }
    return out
  }

  private maskRecordRow<R extends Record<string, unknown>>(r: R): R {
    return this.maskTexts(r, ['prompt', 'demandContent', 'notes', 'remark'] as (keyof R)[])
  }

  private async audit(
    recordId: string,
    operatorId: string,
    action: string,
    detail?: Prisma.InputJsonValue,
    ip?: string,
  ) {
    await this.prisma.generationRecordAuditLog.create({
      data: {
        recordId,
        operatorId,
        action,
        detail: detail ?? undefined,
        ip: ip ?? undefined,
      },
    })
  }

  private buildWhere(
    user: SessionUser,
    p: RecordsListParams,
  ): Prisma.GenerationRecordWhereInput {
    const recycleOnly = p.recycle === '1' || p.recycle === 'true'
    const ands: Prisma.GenerationRecordWhereInput[] = [this.buildAccessScope(user)]

    if (
      p.filterTeamId?.trim() &&
      user.role === UserRole.SUPER_ADMIN
    ) {
      ands.push({ teamId: p.filterTeamId.trim() })
    }

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
          { demandContent: { contains: kw, mode: 'insensitive' } },
          { notes: { contains: kw, mode: 'insensitive' } },
          { remark: { contains: kw, mode: 'insensitive' } },
          { errorMessage: { contains: kw, mode: 'insensitive' } },
          { suite: { name: { contains: kw, mode: 'insensitive' } } },
          {
            suite: {
              cases: {
                some: {
                  OR: [
                    { title: { contains: kw, mode: 'insensitive' } },
                    { expectedResult: { contains: kw, mode: 'insensitive' } },
                    { precondition: { contains: kw, mode: 'insensitive' } },
                  ],
                },
              },
            },
          },
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

    const cmin = p.caseCountMin != null ? Number(p.caseCountMin) : undefined
    const cmax = p.caseCountMax != null ? Number(p.caseCountMax) : undefined
    if (cmin != null && !Number.isNaN(cmin)) ands.push({ caseCount: { gte: cmin } })
    if (cmax != null && !Number.isNaN(cmax)) ands.push({ caseCount: { lte: cmax } })

    const sources = splitCsv(p.sources)
    if (sources?.length) {
      const genIn: GenerationSource[] = []
      for (const s of sources) {
        if (s === 'file') genIn.push(GenerationSource.FILE_PARSE)
        if (s === 'text') genIn.push(GenerationSource.MANUAL_INPUT)
        if (s === 'template') genIn.push(GenerationSource.TEMPLATE)
      }
      if (genIn.length) ands.push({ generationSource: { in: genIn } })
    }

    return { AND: ands }
  }

  async getSummary(user: SessionUser) {
    const whereActive: Prisma.GenerationRecordWhereInput = {
      AND: [this.buildAccessScope(user), { deletedAt: null }],
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

  /** 团队看板：仅 ADMIN / SUPER_ADMIN 且已绑定 teamId */
  async getTeamStats(user: SessionUser) {
    if (!user.teamId) {
      throw new BadRequestException('当前用户未绑定团队')
    }
    if (user.role !== UserRole.ADMIN && user.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('仅团队管理员可查看团队统计')
    }
    const whereActive: Prisma.GenerationRecordWhereInput = {
      teamId: user.teamId,
      deletedAt: null,
    }
    const [total, success, failed] = await Promise.all([
      this.prisma.generationRecord.count({ where: whereActive }),
      this.prisma.generationRecord.count({
        where: { ...whereActive, status: GenerationStatus.SUCCESS },
      }),
      this.prisma.generationRecord.count({
        where: { ...whereActive, status: GenerationStatus.FAILED },
      }),
    ])
    return { scope: 'team', teamId: user.teamId, total, success, failed }
  }

  async getDistinctModels(user: SessionUser) {
    const rows = await this.prisma.generationRecord.findMany({
      where: { AND: [this.buildAccessScope(user), { deletedAt: null }] },
      distinct: ['modelId'],
      select: { modelId: true, modelName: true },
      orderBy: { modelName: 'asc' },
    })
    return rows
  }

  async getMatchingIds(user: SessionUser, p: RecordsListParams) {
    const where = this.buildWhere(user, p)
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

  async getRecords(user: SessionUser, params: RecordsListParams) {
    const page = Math.max(1, Number(params.page) || 1)
    const pageSize = Math.min(100, Math.max(1, Number(params.pageSize) || 10))
    const where = this.buildWhere(user, params)
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

    const masked = list.map((r) => {
      const row = this.maskRecordRow(r as unknown as Record<string, unknown>)
      const c = (row as typeof r).creator
      return {
        ...(row as typeof r),
        creator: c
          ? {
              ...c,
              email: maskSensitivePlainText(c.email),
            }
          : c,
      }
    })

    return { list: masked, total, page, pageSize }
  }

  async getById(id: string, user: SessionUser) {
    const record = await this.prisma.generationRecord.findUnique({
      where: { id },
      include: {
        creator: { select: { id: true, username: true, email: true } },
        suite: { select: { id: true, name: true, description: true } },
        template: { select: { id: true, name: true, content: true } },
        file: { select: { id: true, originalName: true, status: true } },
        documentParseRecord: {
          select: { id: true, title: true, createdAt: true },
        },
        auditLogs: {
          orderBy: { createdAt: 'desc' },
          take: 100,
          include: { operator: { select: { id: true, username: true } } },
        },
      },
    })
    if (!record) throw new NotFoundException('记录不存在')
    this.assertCanAccess(record, user)

    const base = this.maskRecordRow(record as unknown as Record<string, unknown>) as typeof record
    const masked = {
      ...base,
      creator: base.creator
        ? {
            ...base.creator,
            email: maskSensitivePlainText(base.creator.email),
          }
        : base.creator,
      template: base.template
        ? {
            ...base.template,
            content: maskSensitivePlainText(base.template.content),
          }
        : base.template,
    }

    return masked
  }

  async listDownloadsForRecord(recordId: string, user: SessionUser) {
    const record = await this.prisma.generationRecord.findUnique({ where: { id: recordId } })
    if (!record) throw new NotFoundException('记录不存在')
    this.assertCanAccess(record, user)

    const [suiteRows, recordExports] = await Promise.all([
      record.suiteId
        ? this.prisma.downloadRecord.findMany({
            where: { suiteId: record.suiteId },
            orderBy: { createdAt: 'desc' },
            take: 80,
            include: { downloader: { select: { id: true, username: true } } },
          })
        : Promise.resolve([]),
      this.prisma.generationRecordExport.findMany({
        where: { recordId },
        orderBy: { createdAt: 'desc' },
        take: 80,
        include: { operator: { select: { id: true, username: true } } },
      }),
    ])

    const unified = [
      ...suiteRows.map((d) => ({
        id: d.id,
        source: 'suite' as const,
        suiteId: d.suiteId,
        format: d.format,
        fileSize: d.fileSize,
        downloadUrl: d.downloadUrl,
        createdAt: d.createdAt,
        downloader: d.downloader,
        downloadCount: 1,
      })),
      ...recordExports.map((e) => ({
        id: e.id,
        source: 'record' as const,
        suiteId: e.suiteId,
        format: e.format,
        fileSize: e.fileSize,
        downloadUrl: e.storagePath,
        createdAt: e.createdAt,
        downloader: e.operator,
        downloadCount: e.downloadCount,
      })),
    ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())

    return unified.slice(0, 120)
  }

  async listAuditLogs(recordId: string, user: SessionUser, take = 200) {
    const record = await this.prisma.generationRecord.findUnique({ where: { id: recordId } })
    if (!record) throw new NotFoundException('记录不存在')
    this.assertCanAccess(record, user)
    const rows = await this.prisma.generationRecordAuditLog.findMany({
      where: { recordId },
      orderBy: { createdAt: 'desc' },
      take: Math.min(take, 500),
      include: { operator: { select: { id: true, username: true, email: true } } },
    })
    return rows.map((row) => ({
      ...row,
      operator: row.operator
        ? {
            ...row.operator,
            email: maskSensitivePlainText(row.operator.email),
          }
        : row.operator,
    }))
  }

  async patch(
    id: string,
    user: SessionUser,
    dto: UpdateGenerationRecordDto,
    ip?: string,
  ) {
    this.assertCanMutate(user)
    const record = await this.prisma.generationRecord.findUnique({ where: { id } })
    if (!record) throw new NotFoundException('记录不存在')
    this.assertCanAccess(record, user)
    if (record.deletedAt) throw new BadRequestException('已删除记录请从回收站恢复后再操作')

    const data: Prisma.GenerationRecordUpdateInput = {}
    if (dto.title !== undefined) data.title = dto.title.slice(0, 200)

    if (dto.prompt !== undefined) {
      data.prompt = dto.prompt
      data.demandContent = dto.prompt
    }
    if (dto.demandContent !== undefined) {
      data.demandContent = dto.demandContent
      data.prompt = dto.demandContent
    }
    if (dto.notes !== undefined) {
      data.notes = dto.notes
      data.remark = dto.notes
    }
    if (dto.remark !== undefined) {
      data.remark = dto.remark
      data.notes = dto.remark
    }
    if (dto.tags !== undefined) data.tags = dto.tags
    if (dto.status !== undefined) data.status = dto.status

    if (Object.keys(data).length === 0) return this.getById(id, user)

    const updated = await this.prisma.generationRecord.update({ where: { id }, data })
    await this.audit(id, user.id, 'PATCH', dto as unknown as Prisma.InputJsonValue, ip)
    return this.getById(updated.id, user)
  }

  async softDelete(id: string, user: SessionUser, ip?: string) {
    this.assertCanMutate(user)
    const record = await this.prisma.generationRecord.findUnique({ where: { id } })
    if (!record) throw new NotFoundException('记录不存在')
    this.assertCanAccess(record, user)
    if (record.deletedAt) return record
    const r = await this.prisma.generationRecord.update({
      where: { id },
      data: { deletedAt: new Date(), isDeleted: true },
    })
    await this.audit(id, user.id, 'SOFT_DELETE', {}, ip)
    return r
  }

  async restore(id: string, user: SessionUser, ip?: string) {
    this.assertCanMutate(user)
    const record = await this.prisma.generationRecord.findUnique({ where: { id } })
    if (!record) throw new NotFoundException('记录不存在')
    this.assertCanAccess(record, user)
    if (!record.deletedAt) return record
    const r = await this.prisma.generationRecord.update({
      where: { id },
      data: { deletedAt: null, isDeleted: false },
    })
    await this.audit(id, user.id, 'RESTORE', {}, ip)
    return r
  }

  async permanentDelete(id: string, user: SessionUser, ip?: string) {
    this.assertCanMutate(user)
    const record = await this.prisma.generationRecord.findUnique({ where: { id } })
    if (!record) throw new NotFoundException('记录不存在')
    this.assertCanAccess(record, user)
    if (!record.deletedAt) {
      throw new BadRequestException('请先将记录移入回收站后再彻底删除')
    }
    await this.audit(id, user.id, 'PERMANENT_DELETE', {}, ip)
    await this.prisma.generationRecord.delete({ where: { id } })
  }

  async batch(
    user: SessionUser,
    ids: string[],
    action: BatchRecordAction,
    tags?: string[],
    ip?: string,
  ) {
    this.assertCanMutate(user)
    const unique = [...new Set(ids)].filter(Boolean)
    if (!unique.length) throw new BadRequestException('请选择记录')

    const scope = this.buildAccessScope(user)
    const records = await this.prisma.generationRecord.findMany({
      where: { AND: [{ id: { in: unique } }, scope] },
    })
    const allowedIds = records.map((r) => r.id)
    if (!allowedIds.length) throw new BadRequestException('没有可操作的记录')

    switch (action) {
      case 'SOFT_DELETE': {
        await this.prisma.generationRecord.updateMany({
          where: { AND: [{ id: { in: allowedIds } }, { deletedAt: null }, scope] },
          data: { deletedAt: new Date(), isDeleted: true },
        })
        for (const rid of allowedIds) {
          await this.audit(rid, user.id, 'BATCH_SOFT_DELETE', {}, ip)
        }
        break
      }
      case 'RESTORE': {
        await this.prisma.generationRecord.updateMany({
          where: { AND: [{ id: { in: allowedIds } }, { deletedAt: { not: null } }, scope] },
          data: { deletedAt: null, isDeleted: false },
        })
        for (const rid of allowedIds) {
          await this.audit(rid, user.id, 'BATCH_RESTORE', {}, ip)
        }
        break
      }
      case 'ARCHIVE': {
        await this.prisma.generationRecord.updateMany({
          where: { AND: [{ id: { in: allowedIds } }, { deletedAt: null }, scope] },
          data: { status: GenerationStatus.ARCHIVED },
        })
        for (const rid of allowedIds) {
          await this.audit(rid, user.id, 'BATCH_ARCHIVE', {}, ip)
        }
        break
      }
      case 'CANCEL': {
        await this.prisma.generationRecord.updateMany({
          where: { AND: [{ id: { in: allowedIds } }, { deletedAt: null }, scope] },
          data: { status: GenerationStatus.CANCELLED },
        })
        for (const rid of allowedIds) {
          await this.audit(rid, user.id, 'BATCH_CANCEL', {}, ip)
        }
        break
      }
      case 'UPDATE_TAGS': {
        if (tags === undefined) throw new BadRequestException('UPDATE_TAGS 需提供 tags')
        await this.prisma.generationRecord.updateMany({
          where: { AND: [{ id: { in: allowedIds } }, scope] },
          data: { tags },
        })
        for (const rid of allowedIds) {
          await this.audit(rid, user.id, 'BATCH_UPDATE_TAGS', { tags } as unknown as Prisma.InputJsonValue, ip)
        }
        break
      }
      case 'PERMANENT_DELETE': {
        const inBin = records.filter((r) => r.deletedAt && allowedIds.includes(r.id))
        if (inBin.length !== allowedIds.length) {
          throw new BadRequestException('仅回收站中的记录可彻底删除')
        }
        for (const rid of allowedIds) {
          await this.audit(rid, user.id, 'BATCH_PERMANENT_DELETE', {}, ip)
        }
        await this.prisma.generationRecord.deleteMany({
          where: { AND: [{ id: { in: allowedIds } }, scope] },
        })
        break
      }
      default:
        throw new BadRequestException('不支持的操作')
    }

    return { ok: true, affected: allowedIds.length }
  }

  async createShare(recordId: string, user: SessionUser, dto: CreateRecordShareDto, ip?: string) {
    this.assertCanMutate(user)
    const record = await this.prisma.generationRecord.findUnique({ where: { id: recordId } })
    if (!record) throw new NotFoundException('记录不存在')
    this.assertCanAccess(record, user)
    if (record.deletedAt) throw new BadRequestException('回收站中的记录不可分享')

    const token = randomBytes(24).toString('hex')
    let expiresAt: Date | null = null
    if (dto.expiresDays != null) {
      expiresAt = new Date()
      expiresAt.setDate(expiresAt.getDate() + dto.expiresDays)
    }

    const permission = (dto.permission ?? {
      viewDemand: true,
      viewCases: true,
    }) as Prisma.InputJsonValue

    await this.prisma.generationRecordShare.create({
      data: {
        recordId,
        sharerId: user.id,
        token,
        expiresAt,
        permission,
      },
    })
    await this.audit(recordId, user.id, 'SHARE_CREATE', { expiresAt: expiresAt?.toISOString() }, ip)

    return {
      token,
      path: `/records/public/shares/${token}`,
      expiresAt,
    }
  }

  /** 公开：校验分享令牌 */
  async getPublicShareContent(token: string) {
    const share = await this.prisma.generationRecordShare.findUnique({
      where: { token },
      include: {
        record: {
          include: {
            suite: {
              include: {
                cases: { take: 500, orderBy: { createdAt: 'asc' } },
              },
            },
          },
        },
      },
    })
    if (!share || share.revoked) throw new NotFoundException('分享不存在或已失效')
    if (share.expiresAt && share.expiresAt.getTime() < Date.now()) {
      throw new HttpException('分享已过期', HttpStatus.GONE)
    }

    const perm = share.permission as { viewDemand?: boolean; viewCases?: boolean }
    const viewDemand = perm.viewDemand !== false
    const viewCases = perm.viewCases !== false

    const r = share.record
    const demand = viewDemand
      ? maskSensitivePlainText(r.prompt ?? '')
      : '[hidden]'
    const cases = viewCases ? r.suite?.cases ?? [] : []

    return {
      record: {
        id: r.id,
        title: r.title,
        status: r.status,
        caseCount: r.caseCount,
        createdAt: r.createdAt,
        demandContent: demand,
        generateParams: r.generateParams,
        promptTemplateSnapshot: r.promptTemplateSnapshot
          ? maskSensitivePlainText(r.promptTemplateSnapshot)
          : null,
      },
      cases: cases.map((c) => ({
        id: c.id,
        title: c.title,
        priority: c.priority,
        precondition: c.precondition,
        steps: c.steps,
        expectedResult: maskSensitivePlainText(c.expectedResult),
      })),
    }
  }

  async compare(leftId: string, rightId: string, user: SessionUser) {
    const [a, b] = await Promise.all([
      this.prisma.generationRecord.findUnique({
        where: { id: leftId },
        include: { suite: true },
      }),
      this.prisma.generationRecord.findUnique({
        where: { id: rightId },
        include: { suite: true },
      }),
    ])
    if (!a || !b) throw new NotFoundException('记录不存在')
    this.assertCanAccess(a, user)
    this.assertCanAccess(b, user)

    if (!a.suiteId || !b.suiteId) {
      return {
        leftId,
        rightId,
        added: [],
        removed: [],
        changed: [],
      }
    }

    const [ca, cb] = await Promise.all([
      this.prisma.testCase.findMany({ where: { suiteId: a.suiteId } }),
      this.prisma.testCase.findMany({ where: { suiteId: b.suiteId } }),
    ])

    const key = (c: { title: string; expectedResult: string }) =>
      `${c.title.trim()}::${c.expectedResult.trim()}`.slice(0, 4000)

    const mapA = new Map(ca.map((c) => [key(c), c]))
    const mapB = new Map(cb.map((c) => [key(c), c]))

    const added = cb.filter((c) => !mapA.has(key(c))).map((c) => ({ id: c.id, title: c.title }))
    const removed = ca.filter((c) => !mapB.has(key(c))).map((c) => ({ id: c.id, title: c.title }))

    const changed: { title: string; leftId: string; rightId: string }[] = []
    for (const [k, va] of mapA) {
      const vb = mapB.get(k)
      if (vb && va.id !== vb.id) {
        changed.push({ title: va.title, leftId: va.id, rightId: vb.id })
      }
    }

    return { leftId, rightId, added, removed, changed }
  }

  async exportRecord(recordId: string, user: SessionUser, format: string) {
    const record = await this.prisma.generationRecord.findUnique({ where: { id: recordId } })
    if (!record?.suiteId) throw new BadRequestException('无关联用例集，无法导出')
    this.assertCanAccess(record, user)
    return this.testcases.exportSuite(record.suiteId, format, user.id)
  }
}
