import { request } from '@/utils/request'
import type { GenerationRecord, PaginatedData, PaginationParams } from '@/types'

export const recordsApi = {
  getRecords: (params?: PaginationParams & { status?: string; keyword?: string }) =>
    request.get<PaginatedData<GenerationRecord>>('/records', { params }),

  getRecordById: (id: string) =>
    request.get<GenerationRecord>(`/records/${id}`),

  deleteRecord: (id: string) =>
    request.delete<void>(`/records/${id}`),
}
