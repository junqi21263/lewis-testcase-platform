import { request } from '@/utils/request'
import type { GenerationRecord, PaginatedData, PaginationParams, TestSuite, TestCase } from '@/types'

export interface RecordsSummary {
  total: number
  success: number
  failed: number
  processing: number
  pending: number
  successRate: number
}

export const recordsApi = {
  getRecords: (params?: PaginationParams & {
    status?: string
    keyword?: string
    modelId?: string
    from?: string
    to?: string
    minCaseCount?: number
    maxCaseCount?: number
  }) =>
    request.get<PaginatedData<GenerationRecord>>('/records', { params }),

  getSummary: () =>
    request.get<RecordsSummary>('/records/summary'),

  getRecordById: (id: string) =>
    request.get<GenerationRecord>(`/records/${id}`),

  getRecordResult: (id: string) =>
    request.get<{
      record: GenerationRecord
      suite: TestSuite | null
      cases: TestCase[]
      stats: { total: number; byPriority: Record<string, number>; byType: Record<string, number> }
    }>(`/records/${id}/result`),

  deleteRecord: (id: string) =>
    request.delete<void>(`/records/${id}`),

  batchDelete: (ids: string[]) =>
    request.post<{ deleted: number }>('/records/batch-delete', { ids }),
}
