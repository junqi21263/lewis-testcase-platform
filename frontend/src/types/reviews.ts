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

export type ReviewWorkspace = {
  record: ReviewWorkspaceRecord
  summary: ReviewWorkspaceSummary
  cases: ReviewWorkspaceCase[]
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
