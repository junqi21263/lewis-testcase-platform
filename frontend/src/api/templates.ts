import { request } from '@/utils/request'
import type {
  PromptEvaluationReport,
  PromptTemplate,
  PaginatedData,
  PaginationParams,
  TemplateEvaluationJob,
} from '@/types'
import { getApiBaseUrl } from '@/utils/apiBaseUrl'
import { useAuthStore } from '@/store/authStore'

export const templatesApi = {
  getTemplates: (params?: PaginationParams & { category?: string; keyword?: string }) =>
    request.get<PaginatedData<PromptTemplate>>('/templates', { params }),

  getTemplateById: (id: string) =>
    request.get<PromptTemplate>(`/templates/${id}`),

  createTemplate: (data: Partial<PromptTemplate>) =>
    request.post<PromptTemplate>('/templates', data),

  updateTemplate: (id: string, data: Partial<PromptTemplate>) =>
    request.patch<PromptTemplate>(`/templates/${id}`, data),

  deleteTemplate: (id: string) =>
    request.delete<void>(`/templates/${id}`),

  evaluateTemplate: (
    id: string,
    data?: { modelConfigId?: string; sampleLimit?: number; temperature?: number; maxTokens?: number },
  ) =>
    request.post<PromptEvaluationReport>(`/templates/${id}/evaluate`, data ?? {}, {
      timeout: 900000,
      suppressToast: true,
    }),

  startEvaluation: (
    id: string,
    data?: { modelConfigId?: string; sampleLimit?: number; temperature?: number; maxTokens?: number },
  ) =>
    request.post<TemplateEvaluationJob>(`/templates/${id}/evaluations`, data ?? {}, {
      timeout: 60_000,
      suppressToast: true,
    }),

  getEvaluationJob: (jobId: string) =>
    request.get<TemplateEvaluationJob>(`/templates/evaluations/${jobId}`),

  cancelEvaluationJob: (jobId: string) =>
    request.post<TemplateEvaluationJob>(`/templates/evaluations/${jobId}/cancel`, {}, {
      suppressToast: true,
    }),
}

export function subscribeTemplateEvaluationEvents(
  jobId: string,
  onPayload: (payload: TemplateEvaluationJob) => void,
  opts?: { signal?: AbortSignal; onError?: (error: Error) => void },
): void {
  const token = useAuthStore.getState().token
  const base = getApiBaseUrl()
  void fetch(`${base}/templates/evaluations/${jobId}/events`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    signal: opts?.signal,
  })
    .then(async (res) => {
      if (!res.ok || !res.body) {
        opts?.onError?.(new Error(`评测进度连接失败：HTTP ${res.status}`))
        return
      }
      const reader = res.body.getReader()
      const dec = new TextDecoder()
      let carry = ''
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          carry += dec.decode(value, { stream: true })
          const parts = carry.split('\n\n')
          carry = parts.pop() ?? ''
          for (const block of parts) {
            const line = block.trim().split('\n').find((l) => l.startsWith('data:'))
            if (!line) continue
            const json = line.replace(/^data:\s*/, '').trim()
            try {
              onPayload(JSON.parse(json) as TemplateEvaluationJob)
            } catch {
              /* ignore malformed event */
            }
          }
        }
      } finally {
        reader.releaseLock()
      }
    })
    .catch((err) => {
      if ((err as Error)?.name === 'AbortError') return
      opts?.onError?.(err instanceof Error ? err : new Error(String(err)))
    })
}
