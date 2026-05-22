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

    const [cases, reviews, reviewGroups] = await Promise.all([
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
    if (!caseIds.length) throw new BadRequestException('请选择用例')
    for (const id of caseIds) {
      await this.updateReviewStatus(recordId, id, user, status, comment)
    }
    return { ok: true, count: caseIds.length }
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
