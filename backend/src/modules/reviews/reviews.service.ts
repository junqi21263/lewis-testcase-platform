import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import {
  CaseReviewStatus,
  Prisma,
  RecordReviewStatus,
  TestCaseVersionSource,
  UserRole,
} from '@prisma/client'
import { PrismaService } from '@/prisma/prisma.service'
import {
  buildSnapshotFromCase,
  mergeExpectedResults,
  snapshotToCaseUpdate,
  splitExpectedResults,
  type CaseSnapshot,
} from './case-snapshot.util'

type SessionUser = { id: string; role: UserRole; teamId?: string | null }
type ExecutionResultStatus = 'passed' | 'failed' | 'skipped'
type ExecutionResultInput = {
  caseId?: unknown
  reqId?: unknown
  tpId?: unknown
  title?: unknown
  status?: unknown
  durationMs?: unknown
  errorMessage?: unknown
  reportUrl?: unknown
  traceUrl?: unknown
}
type ExecutionResultsPayload = {
  source?: unknown
  summary?: unknown
  results?: unknown
}
type ExecutionResultMatchedBy = 'caseId' | 'tpId' | 'reqId' | 'exactTitle' | 'normalizedTitle'
type ExecutionResultImportItem = {
  caseId: string
  title: string
  status: ExecutionResultStatus
  matchedBy: ExecutionResultMatchedBy
}
type ExecutionResultUnmatchedItem = {
  title: string
  caseId?: string
  status: ExecutionResultStatus
  reason: string
}

@Injectable()
export class ReviewsService {
  private readonly logger = new Logger(ReviewsService.name)

  constructor(private prisma: PrismaService) {}

  private assertCanAccessRecord(
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
    throw new ForbiddenException('无权访问该记录')
  }

  private async getOwnedRecord(recordId: string, user: SessionUser) {
    const record = await this.prisma.generationRecord.findFirst({
      where: { id: recordId, deletedAt: null },
      include: {
        creator: { select: { id: true, username: true } },
        suite: { select: { id: true, name: true } },
      },
    })
    if (!record) throw new NotFoundException('生成记录不存在')
    this.assertCanAccessRecord(record, user)
    return record
  }

  computeRecordReviewStatus(counts: Record<CaseReviewStatus, number>): RecordReviewStatus {
    const total = Object.values(counts).reduce((a, b) => a + b, 0)
    if (total === 0) return RecordReviewStatus.pending_review
    if (counts.rejected > 0) return RecordReviewStatus.rejected
    if (counts.changes_requested > 0) return RecordReviewStatus.changes_requested
    if (counts.approved === total) return RecordReviewStatus.approved
    if (counts.pending_review === total) return RecordReviewStatus.pending_review
    return RecordReviewStatus.in_review
  }

  async recomputeRecordReviewStatus(recordId: string) {
    const rows = await this.prisma.testCaseReview.groupBy({
      by: ['reviewStatus'],
      where: { recordId },
      _count: { id: true },
    })
    const counts = {
      draft: 0,
      pending_review: 0,
      approved: 0,
      changes_requested: 0,
      rejected: 0,
    } as Record<CaseReviewStatus, number>
    for (const r of rows) counts[r.reviewStatus] = r._count.id
    const status = this.computeRecordReviewStatus(counts)
    await this.prisma.generationRecord.update({
      where: { id: recordId },
      data: { reviewStatus: status },
    })
    return { status, counts }
  }

  /** 生成成功后：为套件内每条用例创建评审行 + v1 版本 */
  async bootstrapForRecord(recordId: string, suiteId: string, userId: string) {
    const cases = await this.prisma.testCase.findMany({
      where: { suiteId },
      orderBy: { createdAt: 'asc' },
    })
    if (!cases.length) return { created: 0 }

    const existing = await this.prisma.testCaseReview.count({ where: { recordId } })
    if (existing > 0) return { created: 0, skipped: true }

    await this.prisma.$transaction(async (tx) => {
      for (const c of cases) {
        const snapshot = buildSnapshotFromCase(c)
        await tx.testCaseReview.create({
          data: {
            recordId,
            caseId: c.id,
            reviewStatus: CaseReviewStatus.pending_review,
            currentVersionNumber: 1,
          },
        })
        await tx.testCaseVersion.create({
          data: {
            caseId: c.id,
            recordId,
            versionNumber: 1,
            snapshotJson: snapshot as unknown as Prisma.InputJsonValue,
            sourceType: TestCaseVersionSource.generate,
            changeSummary: 'AI 生成初始版本',
            createdBy: userId,
          },
        })
      }
      await tx.generationRecord.update({
        where: { id: recordId },
        data: { reviewStatus: RecordReviewStatus.pending_review },
      })
    })
    return { created: cases.length }
  }

  /** 旧记录无评审数据时由前端或管理入口触发 */
  async bootstrapForRecordByRecordId(recordId: string, user: SessionUser) {
    const record = await this.getOwnedRecord(recordId, user)
    if (!record.suiteId) throw new BadRequestException('该记录没有用例集')
    return this.bootstrapForRecord(recordId, record.suiteId, user.id)
  }

  async getWorkspace(recordId: string, user: SessionUser) {
    const record = await this.getOwnedRecord(recordId, user)
    if (!record.suiteId) {
      return {
        record,
        summary: { status: record.reviewStatus, counts: {} },
        cases: [],
      }
    }

    const [cases, reviews, reviewGroups, coverageMatrix] = await Promise.all([
      this.prisma.testCase.findMany({
        where: { suiteId: record.suiteId },
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.testCaseReview.findMany({ where: { recordId } }),
      this.prisma.testCaseReview.groupBy({
        by: ['reviewStatus'],
        where: { recordId },
        _count: { id: true },
      }),
      this.prisma.requirementCoverageItem.findMany({
        where: { recordId },
        orderBy: { reqId: 'asc' },
      }),
    ])

    const reviewMap = new Map(reviews.map((r) => [r.caseId, r]))
    const counts = {
      draft: 0,
      pending_review: 0,
      approved: 0,
      changes_requested: 0,
      rejected: 0,
    } as Record<CaseReviewStatus, number>
    for (const g of reviewGroups) counts[g.reviewStatus] = g._count.id

    const items = cases.map((c) => {
      const rv = reviewMap.get(c.id)
      return {
        ...c,
        reviewStatus: rv?.reviewStatus ?? CaseReviewStatus.pending_review,
        currentVersionNumber: rv?.currentVersionNumber ?? 1,
        latestComment: rv?.latestComment ?? null,
        reviewedAt: rv?.reviewedAt?.toISOString() ?? null,
        reviewId: rv?.id ?? null,
      }
    })

    return {
      record: {
        id: record.id,
        title: record.title,
        status: record.status,
        reviewStatus: record.reviewStatus,
        caseCount: record.caseCount,
        suiteId: record.suiteId,
        modelName: record.modelName,
        sourceType: record.sourceType,
        createdAt: record.createdAt.toISOString(),
        updatedAt: record.updatedAt.toISOString(),
        creator: record.creator,
        suite: record.suite,
      },
      summary: {
        status: record.reviewStatus,
        counts,
      },
      cases: items,
      coverageMatrix,
    }
  }

  async getCaseDetail(recordId: string, caseId: string, user: SessionUser) {
    await this.getOwnedRecord(recordId, user)
    const c = await this.prisma.testCase.findFirst({
      where: { id: caseId, suite: { generationRecords: { some: { id: recordId } } } },
    })
    if (!c) throw new NotFoundException('用例不存在')

    const review = await this.prisma.testCaseReview.findUnique({ where: { caseId } })
    const comments = await this.prisma.testCaseComment.findMany({
      where: { caseId, recordId },
      orderBy: { createdAt: 'desc' },
      include: { author: { select: { id: true, username: true } } },
    })

    const snapshot = buildSnapshotFromCase(c)
    return {
      case: c,
      review,
      snapshot,
      comments: comments.map((cm) => ({
        id: cm.id,
        commentType: cm.commentType,
        content: cm.content,
        versionId: cm.versionId,
        createdBy: cm.createdBy,
        authorName: cm.author.username,
        createdAt: cm.createdAt.toISOString(),
      })),
    }
  }

  private normalizeExecutionTitle(title: string): string {
    return title
      .trim()
      .toLowerCase()
      .replace(/[\s\-_:：,，.。/\\|()[\]{}<>《》【】"'“”‘’]+/g, '')
  }

  private normalizeExecutionStatus(value: unknown): ExecutionResultStatus | null {
    const status = String(value ?? '').trim().toLowerCase()
    if (status === 'passed' || status === 'failed' || status === 'skipped') return status
    return null
  }

  private normalizeExecutionResultsPayload(payload: ExecutionResultsPayload): {
    source: string
    summary: string
    results: Array<{
      caseId?: string
      reqId?: string
      tpId?: string
      title: string
      status: ExecutionResultStatus
      durationMs?: number
      errorMessage?: string
      reportUrl?: string
      traceUrl?: string
    }>
  } {
    const rawResults = Array.isArray(payload?.results) ? payload.results : []
    if (!rawResults.length) throw new BadRequestException('执行结果不能为空')
    if (rawResults.length > 500) throw new BadRequestException('单次最多导入 500 条执行结果')

    const results = rawResults.map((item, index) => {
      const row = (item && typeof item === 'object' ? item : {}) as ExecutionResultInput
      const status = this.normalizeExecutionStatus(row.status)
      if (!status) throw new BadRequestException(`第 ${index + 1} 条执行结果 status 无效`)
      const caseId = typeof row.caseId === 'string' ? row.caseId.trim().slice(0, 128) : undefined
      const reqId = typeof row.reqId === 'string' ? row.reqId.trim().toUpperCase().slice(0, 32) : undefined
      const tpId = typeof row.tpId === 'string' ? row.tpId.trim().toUpperCase().slice(0, 32) : undefined
      const title = typeof row.title === 'string' ? row.title.trim().slice(0, 500) : ''
      if (!caseId && !reqId && !tpId && !title) throw new BadRequestException(`第 ${index + 1} 条执行结果缺少 caseId、tpId、reqId 或 title`)
      const durationMsRaw = Number(row.durationMs)
      return {
        caseId: caseId || undefined,
        reqId: reqId || undefined,
        tpId: tpId || undefined,
        title,
        status,
        durationMs: Number.isFinite(durationMsRaw) && durationMsRaw >= 0 ? Math.round(durationMsRaw) : undefined,
        errorMessage: typeof row.errorMessage === 'string' ? row.errorMessage.trim().slice(0, 2000) : undefined,
        reportUrl: typeof row.reportUrl === 'string' ? row.reportUrl.trim().slice(0, 1000) : undefined,
        traceUrl: typeof row.traceUrl === 'string' ? row.traceUrl.trim().slice(0, 1000) : undefined,
      }
    })

    return {
      source: typeof payload?.source === 'string' && payload.source.trim() ? payload.source.trim().slice(0, 80) : 'manual',
      summary: typeof payload?.summary === 'string' ? payload.summary.trim().slice(0, 1000) : '',
      results,
    }
  }

  private buildExecutionActualResult(input: {
    source: string
    status: ExecutionResultStatus
    durationMs?: number
    errorMessage?: string
    reportUrl?: string
    traceUrl?: string
  }) {
    const statusLabel = input.status === 'passed' ? '通过' : input.status === 'failed' ? '失败' : '跳过'
    const lines = [
      `自动化执行${statusLabel}`,
      `来源：${input.source}`,
      input.durationMs != null ? `耗时：${input.durationMs}ms` : '',
      input.errorMessage ? `错误信息：${input.errorMessage}` : '',
      input.reportUrl ? `报告：${input.reportUrl}` : '',
      input.traceUrl ? `Trace：${input.traceUrl}` : '',
    ].filter(Boolean)
    return lines.join('\n').slice(0, 8000)
  }

  private buildExecutionComment(input: {
    source: string
    status: ExecutionResultStatus
    durationMs?: number
    errorMessage?: string
    reportUrl?: string
    traceUrl?: string
    summary?: string
  }) {
    const statusLabel = input.status === 'passed' ? '通过' : input.status === 'failed' ? '失败' : '跳过'
    const lines = [
      `自动化执行${statusLabel}（${input.source}）`,
      input.summary ? `批次说明：${input.summary}` : '',
      input.durationMs != null ? `耗时：${input.durationMs}ms` : '',
      input.errorMessage ? `错误信息：${input.errorMessage}` : '',
      input.reportUrl ? `报告：${input.reportUrl}` : '',
      input.traceUrl ? `Trace：${input.traceUrl}` : '',
    ].filter(Boolean)
    return lines.join('\n').slice(0, 8000)
  }

  async importExecutionResults(
    recordId: string,
    user: SessionUser,
    payload: ExecutionResultsPayload,
  ) {
    if (user.role === UserRole.VIEWER) throw new ForbiddenException('只读用户不可导入执行结果')
    const record = await this.getOwnedRecord(recordId, user)
    if (!record.suiteId) throw new BadRequestException('该记录没有用例集，无法回写执行结果')
    const normalizedPayload = this.normalizeExecutionResultsPayload(payload)

    const [cases, reviews] = await Promise.all([
      this.prisma.testCase.findMany({ where: { suiteId: record.suiteId } }),
      this.prisma.testCaseReview.findMany({ where: { recordId } }),
    ])
    const reviewMap = new Map(reviews.map((review) => [review.caseId, review]))
    const byId = new Map(cases.map((c) => [c.id, c]))
    const byTpId = new Map<string, typeof cases>()
    const byReqId = new Map<string, typeof cases>()
    const exactTitle = new Map<string, typeof cases>()
    const normalizedTitle = new Map<string, typeof cases>()
    for (const c of cases) {
      for (const id of Array.isArray((c as any).testPathIds) ? (c as any).testPathIds : []) {
        const key = String(id).toUpperCase()
        byTpId.set(key, [...(byTpId.get(key) ?? []), c])
      }
      for (const id of Array.isArray((c as any).requirementIds) ? (c as any).requirementIds : []) {
        const key = String(id).toUpperCase()
        byReqId.set(key, [...(byReqId.get(key) ?? []), c])
      }
      exactTitle.set(c.title, [...(exactTitle.get(c.title) ?? []), c])
      const n = this.normalizeExecutionTitle(c.title)
      normalizedTitle.set(n, [...(normalizedTitle.get(n) ?? []), c])
    }
    const coverageRows = await this.prisma.requirementCoverageItem.findMany({ where: { recordId } })
    const coverageByReq = new Map(coverageRows.map((row) => [row.reqId, row]))

    const items: ExecutionResultImportItem[] = []
    const unmatchedItems: ExecutionResultUnmatchedItem[] = []

    for (const input of normalizedPayload.results) {
      let matchedCase: (typeof cases)[number] | undefined
      let matchedBy: ExecutionResultMatchedBy | undefined
      let reason = ''

      if (input.caseId) {
        matchedCase = byId.get(input.caseId)
        if (matchedCase) matchedBy = 'caseId'
        else reason = 'caseId 不属于当前记录'
      }
      if (!matchedCase && input.tpId) {
        const matches = byTpId.get(input.tpId) ?? []
        if (matches.length === 1) {
          matchedCase = matches[0]
          matchedBy = 'tpId'
        } else if (matches.length > 1) {
          reason = 'TP-ID 匹配到多条用例'
        } else {
          reason = 'TP-ID 未匹配到当前记录中的用例'
        }
      }
      if (!matchedCase && input.reqId && !reason.includes('TP-ID 匹配到多条')) {
        const matches = byReqId.get(input.reqId) ?? []
        if (matches.length === 1) {
          matchedCase = matches[0]
          matchedBy = 'reqId'
        } else if (matches.length > 1) {
          reason = 'REQ-ID 匹配到多条用例'
        } else if (!reason) {
          reason = 'REQ-ID 未匹配到当前记录中的用例'
        }
      }
      if (!matchedCase && input.title) {
        const exact = exactTitle.get(input.title) ?? []
        if (exact.length === 1) {
          matchedCase = exact[0]
          matchedBy = 'exactTitle'
        } else if (exact.length > 1) {
          reason = '标题精确匹配到多条用例'
        }
      }
      if (!matchedCase && input.title && !reason.includes('精确匹配到多条')) {
        const norm = normalizedTitle.get(this.normalizeExecutionTitle(input.title)) ?? []
        if (norm.length === 1) {
          matchedCase = norm[0]
          matchedBy = 'normalizedTitle'
        } else if (norm.length > 1) {
          reason = '归一化标题匹配到多条用例'
        }
      }

      if (!matchedCase || !matchedBy) {
        unmatchedItems.push({
          title: input.title,
          caseId: input.caseId,
          status: input.status,
          reason: reason || '未匹配到当前记录中的用例',
        })
        continue
      }

      const review = reviewMap.get(matchedCase.id)
      if (!review) {
        unmatchedItems.push({
          title: input.title || matchedCase.title,
          caseId: matchedCase.id,
          status: input.status,
          reason: '匹配用例尚未初始化评审记录',
        })
        continue
      }

      const actualResult = this.buildExecutionActualResult({
        source: normalizedPayload.source,
        status: input.status,
        durationMs: input.durationMs,
        errorMessage: input.errorMessage,
        reportUrl: input.reportUrl,
        traceUrl: input.traceUrl,
      })
      const comment = this.buildExecutionComment({
        source: normalizedPayload.source,
        summary: normalizedPayload.summary,
        status: input.status,
        durationMs: input.durationMs,
        errorMessage: input.errorMessage,
        reportUrl: input.reportUrl,
        traceUrl: input.traceUrl,
      })

      await this.prisma.$transaction(async (tx) => {
        await tx.testCase.update({
          where: { id: matchedCase.id },
          data: { actualResult },
        })
        await tx.testCaseReview.update({
          where: { caseId: matchedCase.id },
          data: {
            ...(input.status === 'failed'
              ? { reviewStatus: CaseReviewStatus.changes_requested }
              : {}),
            reviewerId: user.id,
            reviewedAt: new Date(),
            latestComment: comment,
          },
        })
        await tx.testCaseComment.create({
          data: {
            caseId: matchedCase.id,
            recordId,
            commentType: input.status === 'failed' ? 'change_request' : 'note',
            content: comment,
            createdBy: user.id,
          },
        })
        const reqIds = [
          ...(Array.isArray((matchedCase as any).requirementIds) ? (matchedCase as any).requirementIds.map(String) : []),
          ...(input.reqId ? [input.reqId] : []),
        ].filter((id, index, arr) => id && arr.indexOf(id) === index)
        for (const reqId of reqIds) {
          const coverage = coverageByReq.get(reqId)
          if (!coverage) continue
          await tx.requirementCoverageItem.update({
            where: { id: coverage.id },
            data: {
              latestExecutionStatus: input.status,
              latestExecutionSummary: actualResult,
            },
          })
        }
      })

      items.push({
        caseId: matchedCase.id,
        title: matchedCase.title,
        status: input.status,
        matchedBy,
      })
    }

    await this.recomputeRecordReviewStatus(recordId)

    const countStatus = (status: ExecutionResultStatus) => items.filter((item) => item.status === status).length
    return {
      matched: items.length,
      unmatched: unmatchedItems.length,
      passed: countStatus('passed'),
      failed: countStatus('failed'),
      skipped: countStatus('skipped'),
      items,
      unmatchedItems,
    }
  }

  async saveCaseEdit(
    recordId: string,
    caseId: string,
    user: SessionUser,
    body: CaseSnapshot,
  ) {
    if (user.role === UserRole.VIEWER) throw new ForbiddenException('只读用户不可编辑')
    await this.getOwnedRecord(recordId, user)
    if (!body.title?.trim()) throw new BadRequestException('标题不能为空')
    if (!body.steps?.length) throw new BadRequestException('至少保留 1 条步骤')
    const exp = body.expectedResults ?? []
    if (!exp.length || exp.every((e) => !e.trim())) {
      throw new BadRequestException('至少保留 1 条预期结果')
    }

    const review = await this.prisma.testCaseReview.findUnique({ where: { caseId } })
    if (!review || review.recordId !== recordId) {
      throw new NotFoundException('评审记录不存在')
    }

    const patch = snapshotToCaseUpdate(body)
    const nextVersion = review.currentVersionNumber + 1

    const updated = await this.prisma.$transaction(async (tx) => {
      const c = await tx.testCase.update({
        where: { id: caseId },
        data: patch,
      })
      await tx.testCaseVersion.create({
        data: {
          caseId,
          recordId,
          versionNumber: nextVersion,
          snapshotJson: body as unknown as Prisma.InputJsonValue,
          sourceType: TestCaseVersionSource.manual_edit,
          changeSummary: '人工编辑保存',
          createdBy: user.id,
        },
      })
      await tx.testCaseReview.update({
        where: { caseId },
        data: { currentVersionNumber: nextVersion, updatedAt: new Date() },
      })
      return c
    })

    await this.recomputeRecordReviewStatus(recordId)
    return { case: updated, versionNumber: nextVersion }
  }

  async updateReviewStatus(
    recordId: string,
    caseId: string,
    user: SessionUser,
    status: CaseReviewStatus,
    comment?: string,
    commentType: 'note' | 'change_request' = 'note',
  ) {
    if (user.role === UserRole.VIEWER) throw new ForbiddenException('只读用户不可评审')
    await this.getOwnedRecord(recordId, user)
    const review = await this.prisma.testCaseReview.findUnique({ where: { caseId } })
    if (!review || review.recordId !== recordId) throw new NotFoundException('评审记录不存在')

    await this.prisma.$transaction(async (tx) => {
      await tx.testCaseReview.update({
        where: { caseId },
        data: {
          reviewStatus: status,
          reviewerId: user.id,
          reviewedAt: new Date(),
          latestComment: comment?.trim() || review.latestComment,
        },
      })
      if (comment?.trim()) {
        await tx.testCaseComment.create({
          data: {
            caseId,
            recordId,
            commentType:
              status === CaseReviewStatus.changes_requested
                ? 'change_request'
                : commentType,
            content: comment.trim(),
            createdBy: user.id,
          },
        })
      }
    })

    await this.recomputeRecordReviewStatus(recordId)
    return { ok: true }
  }

  async batchUpdateReviewStatus(
    recordId: string,
    user: SessionUser,
    caseIds: string[],
    status: CaseReviewStatus,
    comment?: string,
  ) {
    if (user.role === UserRole.VIEWER) throw new ForbiddenException('只读用户不可评审')
    if (!caseIds.length) throw new BadRequestException('请选择用例')
    const uniqueIds = [...new Set(caseIds)]
    await this.getOwnedRecord(recordId, user)

    const reviews = await this.prisma.testCaseReview.findMany({
      where: { recordId, caseId: { in: uniqueIds } },
    })
    const found = new Set(reviews.map((r) => r.caseId))
    const missing = uniqueIds.filter((id) => !found.has(id))
    if (missing.length) {
      throw new NotFoundException(`部分用例尚无评审记录：${missing.slice(0, 3).join(', ')}`)
    }

    const trimmedComment = comment?.trim()
    await this.prisma.$transaction(async (tx) => {
      for (const review of reviews) {
        await tx.testCaseReview.update({
          where: { caseId: review.caseId },
          data: {
            reviewStatus: status,
            reviewerId: user.id,
            reviewedAt: new Date(),
            latestComment: trimmedComment || review.latestComment,
          },
        })
        if (trimmedComment) {
          await tx.testCaseComment.create({
            data: {
              caseId: review.caseId,
              recordId,
              commentType:
                status === CaseReviewStatus.changes_requested ? 'change_request' : 'note',
              content: trimmedComment,
              createdBy: user.id,
            },
          })
        }
      }
    })

    await this.recomputeRecordReviewStatus(recordId)
    return { ok: true, count: uniqueIds.length }
  }

  async listVersions(caseId: string, user: SessionUser) {
    const review = await this.prisma.testCaseReview.findUnique({ where: { caseId } })
    if (!review) throw new NotFoundException('评审记录不存在')
    const record = await this.getOwnedRecord(review.recordId, user)
    const versions = await this.prisma.testCaseVersion.findMany({
      where: { caseId, recordId: record.id },
      orderBy: { versionNumber: 'desc' },
      include: { creator: { select: { id: true, username: true } } },
    })
    return versions.map((v) => ({
      id: v.id,
      caseId: v.caseId,
      recordId: v.recordId,
      versionNumber: v.versionNumber,
      sourceType: v.sourceType,
      changeSummary: v.changeSummary,
      createdBy: v.createdBy,
      authorName: v.creator.username,
      createdAt: v.createdAt.toISOString(),
    }))
  }

  async getVersion(versionId: string, user: SessionUser) {
    const v = await this.prisma.testCaseVersion.findUnique({
      where: { id: versionId },
      include: { creator: { select: { username: true } } },
    })
    if (!v) throw new NotFoundException('版本不存在')
    await this.getOwnedRecord(v.recordId, user)
    return {
      ...v,
      snapshot: v.snapshotJson as CaseSnapshot,
      authorName: v.creator.username,
      createdAt: v.createdAt.toISOString(),
    }
  }

  async restoreVersion(versionId: string, user: SessionUser) {
    if (user.role === UserRole.VIEWER) throw new ForbiddenException('只读用户不可恢复版本')
    const v = await this.prisma.testCaseVersion.findUnique({ where: { id: versionId } })
    if (!v) throw new NotFoundException('版本不存在')
    await this.getOwnedRecord(v.recordId, user)
    const snapshot = {
      ...(v.snapshotJson as CaseSnapshot),
      remarks: (v.snapshotJson as CaseSnapshot).remarks ?? `从 v${v.versionNumber} 恢复`,
    }
    const review = await this.prisma.testCaseReview.findUnique({ where: { caseId: v.caseId } })
    if (!review) throw new NotFoundException('评审记录不存在')
    const patch = snapshotToCaseUpdate(snapshot)
    const nextVersion = review.currentVersionNumber + 1

    const updated = await this.prisma.$transaction(async (tx) => {
      const c = await tx.testCase.update({ where: { id: v.caseId }, data: patch })
      await tx.testCaseVersion.create({
        data: {
          caseId: v.caseId,
          recordId: v.recordId,
          versionNumber: nextVersion,
          snapshotJson: snapshot as unknown as Prisma.InputJsonValue,
          sourceType: TestCaseVersionSource.restore,
          changeSummary: `恢复自 v${v.versionNumber}`,
          createdBy: user.id,
        },
      })
      await tx.testCaseReview.update({
        where: { caseId: v.caseId },
        data: { currentVersionNumber: nextVersion },
      })
      return c
    })
    await this.recomputeRecordReviewStatus(v.recordId)
    return { case: updated, versionNumber: nextVersion }
  }

  diffSnapshots(left: CaseSnapshot, right: CaseSnapshot) {
    const fields: {
      field: string
      label: string
      before: string
      after: string
      changed: boolean
    }[] = []

    const push = (field: string, label: string, before: string, after: string) => {
      fields.push({ field, label, before, after, changed: before !== after })
    }

    push('title', '标题', left.title, right.title)
    push('priority', '优先级', left.priority, right.priority)
    push('type', '类型', left.type, right.type)
    push('tags', '标签', (left.tags ?? []).join(', '), (right.tags ?? []).join(', '))
    push('precondition', '前置条件', left.precondition ?? '', right.precondition ?? '')
    push(
      'steps',
      '步骤',
      (left.steps ?? []).map((s, i) => `${i + 1}. ${s.action}`).join('\n'),
      (right.steps ?? []).map((s, i) => `${i + 1}. ${s.action}`).join('\n'),
    )
    push(
      'expectedResults',
      '预期结果',
      mergeExpectedResults(left.expectedResults ?? splitExpectedResults(left.expectedResult)),
      mergeExpectedResults(right.expectedResults ?? splitExpectedResults(right.expectedResult)),
    )
    if (left.remarks || right.remarks) {
      push('remarks', '备注', left.remarks ?? '', right.remarks ?? '')
    }

    return fields
  }

  async diffVersions(
    caseId: string,
    user: SessionUser,
    opts: { leftVersionId?: string; rightVersionId?: string },
  ) {
    const review = await this.prisma.testCaseReview.findUnique({ where: { caseId } })
    if (!review) throw new NotFoundException('评审记录不存在')
    await this.getOwnedRecord(review.recordId, user)

    const currentCase = await this.prisma.testCase.findUnique({ where: { id: caseId } })
    if (!currentCase) throw new NotFoundException('用例不存在')

    const rightSnap = buildSnapshotFromCase(currentCase)

    let leftSnap: CaseSnapshot
    if (opts.leftVersionId) {
      const lv = await this.getVersion(opts.leftVersionId, user)
      leftSnap = lv.snapshot as CaseSnapshot
    } else {
      const prevNum = Math.max(1, review.currentVersionNumber - 1)
      const prev = await this.prisma.testCaseVersion.findUnique({
        where: { caseId_versionNumber: { caseId, versionNumber: prevNum } },
      })
      leftSnap = prev
        ? (prev.snapshotJson as CaseSnapshot)
        : rightSnap
    }

    if (opts.rightVersionId) {
      const rv = await this.getVersion(opts.rightVersionId, user)
      return this.diffSnapshots(leftSnap, rv.snapshot as CaseSnapshot)
    }

    return this.diffSnapshots(leftSnap, rightSnap)
  }

  async addComment(
    recordId: string,
    caseId: string,
    user: SessionUser,
    content: string,
    commentType: 'note' | 'change_request' = 'note',
  ) {
    if (!content.trim()) throw new BadRequestException('评论不能为空')
    await this.getOwnedRecord(recordId, user)
    const cm = await this.prisma.testCaseComment.create({
      data: {
        caseId,
        recordId,
        commentType,
        content: content.trim(),
        createdBy: user.id,
      },
      include: { author: { select: { username: true } } },
    })
    if (commentType === 'change_request') {
      await this.prisma.testCaseReview.update({
        where: { caseId },
        data: { latestComment: content.trim() },
      })
    }
    return {
      id: cm.id,
      commentType: cm.commentType,
      content: cm.content,
      authorName: cm.author.username,
      createdAt: cm.createdAt.toISOString(),
    }
  }

  async listComments(caseId: string, user: SessionUser) {
    const review = await this.prisma.testCaseReview.findUnique({ where: { caseId } })
    if (!review) throw new NotFoundException('评审记录不存在')
    await this.getOwnedRecord(review.recordId, user)
    const rows = await this.prisma.testCaseComment.findMany({
      where: { caseId },
      orderBy: { createdAt: 'desc' },
      include: { author: { select: { username: true } } },
    })
    return rows.map((r) => ({
      id: r.id,
      commentType: r.commentType,
      content: r.content,
      authorName: r.author.username,
      createdAt: r.createdAt.toISOString(),
    }))
  }
}
