import { request } from '@/utils/request'
import type { GenerationRecord, PaginatedData, PaginationParams } from '@/types'

export interface RecordsSummary {
  total: number
  success: number
  failed: number
  processing: number
  pending: number
  successRate: number
}

export const recordsApi = {
  getRecords: (params?: PaginationParams & { status?: string; keyword?: string }) =>
    request.get<PaginatedData<GenerationRecord>>('/records', { params }),

  getSummary: () =>
    request.get<RecordsSummary>('/records/summary'),

  getRecordById: (id: string) =>
    request.get<GenerationRecord>(`/records/${id}`),

  deleteRecord: (id: string) =>
    request.delete<void>(`/records/${id}`),
}
