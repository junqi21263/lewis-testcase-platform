import { request } from '@/utils/request'

export interface BatchTaskItem {
  id: string
  uploadedFileId?: string | null
  fileName: string
  fileKind: string
  seq: number
  status: 'QUEUED' | 'PROCESSING' | 'SUCCESS' | 'FAILED' | 'CANCELLED'
  errorMessage?: string | null
  startedAt?: string | null
  finishedAt?: string | null
}

export interface BatchTask {
  id: string
  title: string
  moduleType: 'FILE_PARSE' | 'AI_ANALYSIS' | 'TESTCASE_GENERATION'
  status: 'QUEUED' | 'RUNNING' | 'PAUSED' | 'COMPLETED' | 'CANCELLED' | 'FAILED'
  totalCount: number
  successCount: number
  failCount: number
  currentIndex: number
  paused: boolean
  cancelled: boolean
  createdAt: string
  updatedAt: string
  items: BatchTaskItem[]
}

export const multimodalApi = {
  clearAllCache: () => request.delete<{ ok: boolean; deleted: number }>('/multimodal/cache'),
  clearCacheById: (id: string) => request.delete<{ ok: boolean; deleted: number }>(`/multimodal/cache/${id}`),
  createBatchTask: (payload: {
    title: string
    moduleType: 'FILE_PARSE' | 'AI_ANALYSIS' | 'TESTCASE_GENERATION'
    files: Array<{ uploadedFileId?: string; fileName: string; fileKind: string }>
  }) => request.post<BatchTask>('/multimodal/batch-tasks', payload),
  listBatchTasks: () => request.get<BatchTask[]>('/multimodal/batch-tasks'),
  updateBatchTaskState: (id: string, action: 'pause' | 'resume' | 'cancel') =>
    request.post<BatchTask>(`/multimodal/batch-tasks/${id}/state`, undefined, { params: { action } }),
}
