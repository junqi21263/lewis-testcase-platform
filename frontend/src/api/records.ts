import { request } from '@/utils/request'
import type {
  GenerationRecord,
  PaginatedData,
  PublicSharePayload,
  RecordDownloadEntry,
} from '@/types'
import type { BatchRecordAction } from '@/types/records'
import { getApiBaseUrl } from '@/utils/apiBaseUrl'
import type { ApiResponse } from '@/types'

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

export interface TeamRecordsStats {
  scope: string
  teamId: string
  total: number
  success: number
  failed: number
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
  /** 仅 SUPER_ADMIN：按团队筛选 */
  filterTeamId?: string
  caseCountMin?: string
  caseCountMax?: string
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

export interface RecordShareCreateResult {
  token: string
  path: string
  expiresAt: string | null
}

export interface RecordCompareResult {
  leftId: string
  rightId: string
  added: { id: string; title: string }[]
  removed: { id: string; title: string }[]
  changed: { title: string; leftId: string; rightId: string }[]
}

/** 公开分享（无 JWT），与 axios 封装分离 */
export async function fetchPublicRecordShare(token: string): Promise<PublicSharePayload> {
  const res = await fetch(`${getApiBaseUrl()}/records/public/shares/${encodeURIComponent(token)}`)
  const json = (await res.json()) as ApiResponse<PublicSharePayload>
  if (!res.ok) {
    const msg =
      typeof json.message === 'string'
        ? json.message
        : res.status === 410
          ? '分享已过期'
          : '加载失败'
    throw new Error(msg)
  }
  if (json.code !== 0 && json.code !== 200) {
    throw new Error(typeof json.message === 'string' ? json.message : '加载失败')
  }
  return json.data as PublicSharePayload
}

export const recordsApi = {
  getRecords: (params: RecordsListQuery) =>
    request.get<PaginatedData<GenerationRecord>>('/records', { params }),

  getSummary: () => request.get<RecordsSummary>('/records/summary'),

  getTeamStats: () => request.get<TeamRecordsStats>('/records/stats/team'),

  getMetaModels: () => request.get<RecordModelOption[]>('/records/meta/models'),

  getMatchingIds: (params: Omit<RecordsListQuery, 'page' | 'pageSize'>) =>
    request.get<MatchingIdsResult>('/records/meta/ids', { params }),

  getRecordById: (id: string) => request.get<GenerationRecord>(`/records/${id}`),

  getRecordDownloads: (id: string) =>
    request.get<RecordDownloadEntry[]>(`/records/${id}/downloads`),

  compareRecords: (leftId: string, rightId: string) =>
    request.get<RecordCompareResult>('/records/compare', {
      params: { leftId, rightId },
    }),

  patchRecord: (
    id: string,
    body: Partial<{
      title: string
      prompt: string
      demandContent: string
      tags: string[]
      notes: string
      remark: string
      status: GenerationRecord['status']
    }>,
  ) => request.patch<GenerationRecord>(`/records/${id}`, body),

  createShare: (id: string, body: { expiresDays?: number; permission?: Record<string, unknown> }) =>
    request.post<RecordShareCreateResult>(`/records/${id}/shares`, body),

  /** 软删除 → 回收站 */
  deleteRecord: (id: string) => request.delete<GenerationRecord>(`/records/${id}`),

  restoreRecord: (id: string) => request.post<GenerationRecord>(`/records/${id}/restore`),

  permanentDelete: (id: string) => request.delete<void>(`/records/${id}/hard`),

  archiveRecord: (id: string) => request.post<GenerationRecord>(`/records/${id}/archive`),

  batch: (ids: string[], action: BatchRecordAction, tags?: string[]) =>
    request.post<{ ok: boolean; affected: number }>('/records/batch', {
      ids,
      action,
      ...(tags !== undefined ? { tags } : {}),
    }),
}
