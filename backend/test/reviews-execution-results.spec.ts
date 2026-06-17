import { ForbiddenException } from '@nestjs/common'
import { CaseReviewStatus, UserRole } from '@prisma/client'
import { ReviewsService } from '@/modules/reviews/reviews.service'

const owner = { id: 'user-1', role: UserRole.MEMBER, teamId: null }

function createPrismaMock() {
  const record = {
    id: 'record-1',
    creatorId: 'user-1',
    teamId: null,
    suiteId: 'suite-1',
    reviewStatus: 'pending_review',
    creator: { id: 'user-1', username: 'tester' },
    suite: { id: 'suite-1', name: '登录用例集' },
    status: 'SUCCESS',
    caseCount: 3,
    modelName: 'test-model',
    sourceType: 'text',
    createdAt: new Date('2026-06-17T00:00:00.000Z'),
    updatedAt: new Date('2026-06-17T00:00:00.000Z'),
  }
  const cases = [
    {
      id: 'case-1',
      suiteId: 'suite-1',
      title: '登录-正确账号密码登录成功',
      requirementIds: ['REQ-001'],
      testPathIds: ['TP-001'],
      automationReadiness: { status: 'automatable' },
      actualResult: null,
    },
    {
      id: 'case-2',
      suiteId: 'suite-1',
      title: '登录-密码错误提示',
      requirementIds: ['REQ-002'],
      testPathIds: ['TP-002'],
      automationReadiness: { status: 'automatable' },
      actualResult: null,
    },
    {
      id: 'case-3',
      suiteId: 'suite-1',
      title: '订单导出 Excel',
      requirementIds: ['REQ-003'],
      testPathIds: ['TP-003'],
      automationReadiness: { status: 'manual' },
      actualResult: null,
    },
  ]
  const reviews = [
    { id: 'review-1', recordId: 'record-1', caseId: 'case-1', reviewStatus: CaseReviewStatus.pending_review, latestComment: null },
    { id: 'review-2', recordId: 'record-1', caseId: 'case-2', reviewStatus: CaseReviewStatus.pending_review, latestComment: null },
    { id: 'review-3', recordId: 'record-1', caseId: 'case-3', reviewStatus: CaseReviewStatus.pending_review, latestComment: null },
  ]
  const prisma: any = {
    generationRecord: {
      findFirst: jest.fn().mockResolvedValue(record),
      update: jest.fn().mockResolvedValue(record),
    },
    testCase: {
      findMany: jest.fn().mockResolvedValue(cases),
      update: jest.fn().mockImplementation(({ where, data }) =>
        Promise.resolve({ ...cases.find((c) => c.id === where.id), ...data }),
      ),
    },
    testCaseReview: {
      findMany: jest.fn().mockResolvedValue(reviews),
      groupBy: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({}),
    },
    testCaseComment: {
      create: jest.fn().mockResolvedValue({}),
    },
    requirementCoverageItem: {
      findMany: jest.fn().mockResolvedValue([
        { id: 'cov-1', recordId: 'record-1', reqId: 'REQ-001', coveredCaseIds: ['case-1'] },
        { id: 'cov-2', recordId: 'record-1', reqId: 'REQ-002', coveredCaseIds: ['case-2'] },
      ]),
      update: jest.fn().mockResolvedValue({}),
    },
    $transaction: jest.fn(async (fn: (tx: any) => Promise<unknown>) => fn(prisma)),
  }
  return prisma
}

describe('ReviewsService execution result feedback', () => {
  it('includes requirement coverage matrix in review workspace', async () => {
    const prisma = createPrismaMock()
    const service = new ReviewsService(prisma)

    const workspace = await service.getWorkspace('record-1', owner)

    expect(workspace.coverageMatrix).toEqual([
      expect.objectContaining({
        reqId: 'REQ-001',
        coveredCaseIds: ['case-1'],
      }),
      expect.objectContaining({
        reqId: 'REQ-002',
        coveredCaseIds: ['case-2'],
      }),
    ])
  })

  it('matches by caseId and normalized title, then writes execution comments', async () => {
    const prisma = createPrismaMock()
    const service = new ReviewsService(prisma)

    const result = await service.importExecutionResults('record-1', owner, {
      source: 'playwright',
      results: [
        { caseId: 'case-1', title: 'ignored title', status: 'passed', durationMs: 1200 },
        { title: '登录 密码错误 提示', status: 'failed', errorMessage: '页面未展示错误提示', durationMs: 800 },
      ],
    })

    expect(result).toEqual(
      expect.objectContaining({
        matched: 2,
        unmatched: 0,
        passed: 1,
        failed: 1,
        skipped: 0,
      }),
    )
    expect(result.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ caseId: 'case-1', status: 'passed', matchedBy: 'caseId' }),
        expect.objectContaining({ caseId: 'case-2', status: 'failed', matchedBy: 'normalizedTitle' }),
      ]),
    )
    expect(prisma.testCase.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'case-2' },
        data: expect.objectContaining({
          actualResult: expect.stringContaining('页面未展示错误提示'),
        }),
      }),
    )
    expect(prisma.testCaseReview.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { caseId: 'case-2' },
        data: expect.objectContaining({
          reviewStatus: CaseReviewStatus.changes_requested,
          latestComment: expect.stringContaining('自动化执行失败'),
        }),
      }),
    )
    expect(prisma.testCaseComment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          caseId: 'case-2',
          commentType: 'change_request',
          content: expect.stringContaining('自动化执行失败'),
        }),
      }),
    )
  })

  it('matches execution results by unique TP-ID and updates requirement coverage state', async () => {
    const prisma = createPrismaMock()
    const service = new ReviewsService(prisma)

    const result = await service.importExecutionResults('record-1', owner, {
      source: 'playwright',
      results: [
        { tpId: 'TP-002', status: 'failed', errorMessage: '错误提示未展示' },
      ],
    } as any)

    expect(result.items).toEqual([
      expect.objectContaining({ caseId: 'case-2', matchedBy: 'tpId', status: 'failed' }),
    ])
    expect(prisma.requirementCoverageItem.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'cov-2' },
        data: expect.objectContaining({
          latestExecutionStatus: 'failed',
          latestExecutionSummary: expect.stringContaining('错误提示未展示'),
        }),
      }),
    )
  })

  it('keeps ambiguous TP-ID matches unmatched to avoid wrong write-back', async () => {
    const prisma = createPrismaMock()
    prisma.testCase.findMany.mockResolvedValueOnce([
      { id: 'case-a', suiteId: 'suite-1', title: '路径 A', testPathIds: ['TP-001'], requirementIds: ['REQ-001'] },
      { id: 'case-b', suiteId: 'suite-1', title: '路径 B', testPathIds: ['TP-001'], requirementIds: ['REQ-001'] },
    ])
    const service = new ReviewsService(prisma)

    const result = await service.importExecutionResults('record-1', owner, {
      results: [{ tpId: 'TP-001', status: 'passed' }],
    } as any)

    expect(result.matched).toBe(0)
    expect(result.unmatched).toBe(1)
    expect(result.unmatchedItems[0].reason).toContain('TP-ID 匹配到多条')
    expect(prisma.testCase.update).not.toHaveBeenCalled()
  })

  it('keeps ambiguous title matches unmatched to avoid wrong write-back', async () => {
    const prisma = createPrismaMock()
    prisma.testCase.findMany.mockResolvedValueOnce([
      { id: 'case-a', suiteId: 'suite-1', title: '登录成功' },
      { id: 'case-b', suiteId: 'suite-1', title: '登录 成功' },
    ])
    prisma.testCaseReview.findMany.mockResolvedValueOnce([
      { id: 'review-a', recordId: 'record-1', caseId: 'case-a', reviewStatus: CaseReviewStatus.pending_review },
      { id: 'review-b', recordId: 'record-1', caseId: 'case-b', reviewStatus: CaseReviewStatus.pending_review },
    ])
    const service = new ReviewsService(prisma)

    const result = await service.importExecutionResults('record-1', owner, {
      results: [{ title: '登录-成功', status: 'passed' }],
    })

    expect(result.matched).toBe(0)
    expect(result.unmatched).toBe(1)
    expect(result.unmatchedItems[0].reason).toContain('匹配到多条')
    expect(prisma.testCase.update).not.toHaveBeenCalled()
  })

  it('rejects viewer users', async () => {
    const prisma = createPrismaMock()
    const service = new ReviewsService(prisma)

    await expect(
      service.importExecutionResults(
        'record-1',
        { id: 'viewer-1', role: UserRole.VIEWER, teamId: null },
        { results: [{ caseId: 'case-1', status: 'passed' }] },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException)
  })
})
