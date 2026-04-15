import { request } from '@/utils/request'
import type { GenerationRecord, PaginatedData } from '@/types'
import type { BatchRecordAction } from '@/types/records'

export interface RecordsSummary {
  total: number
  success: number
  failed: number
  processing: number
  pending: number
  archived: number
  cancelled: number
  successRate: number
}

export interface RecordsListQuery {
  page: number
  pageSize: number
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

export interface RecordModelOption {
  modelId: string
  modelName: string
}

export interface MatchingIdsResult {
  ids: string[]
  total: number
  capped: boolean
}

export const recordsApi = {
  getRecords: (params: RecordsListQuery) =>
    request.get<PaginatedData<GenerationRecord>>('/records', { params }),

  getSummary: () => request.get<RecordsSummary>('/records/summary'),

  getMetaModels: () => request.get<RecordModelOption[]>('/records/meta/models'),

  getMatchingIds: (params: Omit<RecordsListQuery, 'page' | 'pageSize'>) =>
    request.get<MatchingIdsResult>('/records/meta/ids', { params }),

  getRecordById: (id: string) => request.get<GenerationRecord>(`/records/${id}`),

  patchRecord: (id: string, body: { status?: GenerationRecord['status'] }) =>
    request.patch<GenerationRecord>(`/records/${id}`, body),

  /** 软删除 → 回收站 */
  deleteRecord: (id: string) => request.delete<GenerationRecord>(`/records/${id}`),

  restoreRecord: (id: string) => request.post<GenerationRecord>(`/records/${id}/restore`),

  permanentDelete: (id: string) => request.delete<void>(`/records/${id}/hard`),

  batch: (ids: string[], action: BatchRecordAction) =>
    request.post<{ ok: boolean; affected: number }>('/records/batch', { ids, action }),
}
