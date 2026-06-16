import { request } from '@/utils/request'

export interface RuntimeHints {
  maxUploadMb: number
  maxFileSizeBytes: number
  throttleTtlSec: number
  throttleLimit: number
  visionPdfMinTextChars?: number
  visionPdfAlways?: boolean
}

export interface MultimodalRuntimeConfig {
  id?: string
  multimodalEnabled: boolean
  multimodalDefaultModel: string
  textFallbackModel: string
  maxConcurrentTasks: number
  cacheTtlDays: number
  monthlyCostAlertCny: number
  autoDowngradeWhenOverBudget: boolean
  multimodalInputPricePer1kCny: number
  multimodalOutputPricePer1kCny: number
  textInputPricePer1kCny: number
  textOutputPricePer1kCny: number
}

export type UpdateMultimodalRuntimeConfigPayload = Partial<MultimodalRuntimeConfig>

export interface AIModelAdmin {
  id: string
  name: string
  provider: string
  modelId: string
  baseUrl: string
  maxTokens: number
  temperature: number
  isDefault: boolean
  isActive: boolean
  supportsVision: boolean
  useForDocumentVisionParse: boolean
  hasApiKey: boolean
  /** 最近一次连通性测试（管理员「测试」按钮）；旧后端可能无此字段 */
  lastTestAt?: string | null
  lastTestOk?: boolean | null
  lastTestLatencyMs?: number | null
  lastTestError?: string | null
  createdAt: string
  updatedAt: string
}

export interface CreateAiModelPayload {
  name: string
  provider: string
  modelId: string
  baseUrl: string
  apiKey: string
  maxTokens?: number
  temperature?: number
  isDefault?: boolean
  isActive?: boolean
  supportsVision?: boolean
  useForDocumentVisionParse?: boolean
}

export type UpdateAiModelPayload = Partial<
  Omit<CreateAiModelPayload, 'apiKey'> & { apiKey?: string; isActive?: boolean; isDefault?: boolean }
>

export const settingsApi = {
  getRuntime: () => request.get<RuntimeHints>('/settings/runtime'),

  getMultimodalConfig: () => request.get<MultimodalRuntimeConfig>('/settings/multimodal-config'),

  updateMultimodalConfig: (data: UpdateMultimodalRuntimeConfigPayload) =>
    request.patch<MultimodalRuntimeConfig>('/settings/multimodal-config', data),

  listModelsAdmin: () => request.get<AIModelAdmin[]>('/settings/models'),

  createModel: (data: CreateAiModelPayload) =>
    request.post<AIModelAdmin>('/settings/models', data),

  updateModel: (id: string, data: UpdateAiModelPayload) =>
    request.patch<AIModelAdmin>(`/settings/models/${id}`, data),

  archiveModel: (id: string) => request.post<{ ok: boolean }>(`/settings/models/${id}/archive`),

  deleteModel: (id: string) => request.delete<{ ok: boolean }>(`/settings/models/${id}`),

  setDefaultModel: (id: string) => request.post<{ ok: boolean }>(`/settings/models/${id}/set-default`),
}
