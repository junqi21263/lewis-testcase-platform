import { request } from '@/utils/request'
import type {
  CaseReviewStatus,
  CaseSnapshot,
  CaseVersionItem,
  ReviewComment,
  ReviewWorkspace,
  VersionDiffField,
} from '@/types/reviews'

export const reviewsApi = {
  getWorkspace: (recordId: string) =>
    request.get<ReviewWorkspace>(`/reviews/records/${recordId}/workspace`),

  getCaseDetail: (recordId: string, caseId: string) =>
    request.get<{
      case: Record<string, unknown>
      review: Record<string, unknown> | null
      snapshot: CaseSnapshot
      comments: ReviewComment[]
    }>(`/reviews/records/${recordId}/cases/${caseId}`),

  saveCase: (recordId: string, caseId: string, body: CaseSnapshot) =>
    request.patch<{ case: Record<string, unknown>; versionNumber: number }>(
      `/reviews/records/${recordId}/cases/${caseId}`,
      body,
    ),

  updateStatus: (
    recordId: string,
    caseId: string,
    body: { status: CaseReviewStatus; comment?: string; commentType?: 'note' | 'change_request' },
  ) =>
    request.patch<{ ok: boolean }>(
      `/reviews/records/${recordId}/cases/${caseId}/status`,
      body,
    ),

  batchStatus: (
    recordId: string,
    body: { caseIds: string[]; status: CaseReviewStatus; comment?: string },
  ) =>
    request.post<{ ok: boolean; count: number }>(
      `/reviews/records/${recordId}/batch-status`,
      body,
    ),

  listVersions: (caseId: string) =>
    request.get<CaseVersionItem[]>(`/reviews/cases/${caseId}/versions`),

  getVersion: (versionId: string) =>
    request.get<{
      id: string
      versionNumber: number
      snapshot: CaseSnapshot
      sourceType: string
      changeSummary: string | null
      authorName: string
      createdAt: string
    }>(`/reviews/versions/${versionId}`),

  restoreVersion: (versionId: string) =>
    request.post<{ case: Record<string, unknown>; versionNumber: number }>(
      `/reviews/versions/${versionId}/restore`,
    ),

  diff: (caseId: string, params?: { leftVersionId?: string; rightVersionId?: string }) =>
    request.get<VersionDiffField[]>(`/reviews/cases/${caseId}/diff`, { params }),

  listComments: (caseId: string) =>
    request.get<ReviewComment[]>(`/reviews/cases/${caseId}/comments`),

  addComment: (
    recordId: string,
    caseId: string,
    body: { content: string; commentType?: 'note' | 'change_request' },
  ) =>
    request.post<ReviewComment>(
      `/reviews/records/${recordId}/cases/${caseId}/comments`,
      body,
    ),

  bootstrap: (recordId: string) =>
    request.post<{ created?: number; skipped?: boolean }>(
      `/reviews/records/${recordId}/bootstrap`,
    ),
}
