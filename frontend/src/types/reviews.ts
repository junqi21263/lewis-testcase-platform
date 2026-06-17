export type CaseReviewStatus =
  | 'draft'
  | 'pending_review'
  | 'approved'
  | 'changes_requested'
  | 'rejected'

export type RecordReviewStatus =
  | 'pending_review'
  | 'in_review'
  | 'approved'
  | 'changes_requested'
  | 'rejected'

export type TestCaseVersionSource = 'generate' | 'manual_edit' | 'restore'

export type TestCaseCommentType = 'note' | 'change_request'

export type CaseSnapshot = {
  title: string
  priority: string
  type: string
  tags: string[]
  precondition: string
  steps: { order: number; action: string; expected?: string }[]
  expectedResults: string[]
  expectedResult: string
  remarks?: string
  requirementIds?: string[]
  testPathIds?: string[]
  automationReadiness?: {
    status: 'automatable' | 'manual' | 'blocked'
    reason: string
  } | null
}

export type ReviewWorkspaceCase = {
  id: string
  title: string
  priority: string
  type: string
  tags: unknown
  reviewStatus: CaseReviewStatus
  currentVersionNumber: number
  latestComment: string | null
  reviewedAt: string | null
  reviewId: string | null
  updatedAt: string
  requirementIds?: string[]
  testPathIds?: string[]
  automationReadiness?: {
    status: 'automatable' | 'manual' | 'blocked'
    reason: string
  } | null
}

export type ReviewWorkspaceRecord = {
  id: string
  title: string
  status: string
  reviewStatus: RecordReviewStatus
  caseCount: number
  suiteId: string | null
  modelName: string
  sourceType: string
  createdAt: string
  updatedAt: string
  creator?: { id: string; username: string }
  suite?: { id: string; name: string } | null
}

export type ReviewWorkspaceSummary = {
  status: RecordReviewStatus
  counts: Partial<Record<CaseReviewStatus, number>>
}

export type RequirementCoverageItem = {
  id: string
  recordId: string
  reqId: string
  requirementText: string
  requirementType?: string | null
  coveredCaseIds: string[]
  latestExecutionStatus?: string | null
  latestExecutionSummary?: string | null
  riskNotes?: string | null
  gapReason?: string | null
  createdAt?: string
  updatedAt?: string
}

export type ReviewWorkspace = {
  record: ReviewWorkspaceRecord
  summary: ReviewWorkspaceSummary
  cases: ReviewWorkspaceCase[]
  coverageMatrix?: RequirementCoverageItem[]
}

export type ReviewComment = {
  id: string
  commentType: TestCaseCommentType
  content: string
  authorName: string
  createdAt: string
  versionId?: string | null
}

export type CaseVersionItem = {
  id: string
  caseId: string
  recordId: string
  versionNumber: number
  sourceType: TestCaseVersionSource
  changeSummary: string | null
  createdBy: string
  authorName: string
  createdAt: string
}

export type VersionDiffField = {
  field: string
  label: string
  before: string
  after: string
  changed: boolean
}

export type ExecutionResultStatus = 'passed' | 'failed' | 'skipped'

export type ExecutionResultInput = {
  caseId?: string
  reqId?: string
  tpId?: string
  title?: string
  status: ExecutionResultStatus
  durationMs?: number
  errorMessage?: string
  reportUrl?: string
  traceUrl?: string
}

export type ExecutionResultsPayload = {
  source?: string
  summary?: string
  results: ExecutionResultInput[]
}

export type ExecutionResultsImportResponse = {
  matched: number
  unmatched: number
  passed: number
  failed: number
  skipped: number
  items: Array<{
    caseId: string
    title: string
    status: ExecutionResultStatus
    matchedBy: 'caseId' | 'tpId' | 'reqId' | 'exactTitle' | 'normalizedTitle'
  }>
  unmatchedItems: Array<{
    title: string
    caseId?: string
    reqId?: string
    tpId?: string
    status: ExecutionResultStatus
    reason: string
  }>
}
