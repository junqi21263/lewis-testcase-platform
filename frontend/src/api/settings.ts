import { request } from '@/utils/request'

export interface RuntimeHints {
  maxUploadMb: number
  maxFileSizeBytes: number
  throttleTtlSec: number
  throttleLimit: number
  visionPdfMinTextChars?: number
  visionPdfAlways?: boolean
}

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

  listModelsAdmin: () => request.get<AIModelAdmin[]>('/settings/models'),

  createModel: (data: CreateAiModelPayload) =>
    request.post<AIModelAdmin>('/settings/models', data),

  updateModel: (id: string, data: UpdateAiModelPayload) =>
    request.patch<AIModelAdmin>(`/settings/models/${id}`, data),

  archiveModel: (id: string) => request.post<{ ok: boolean }>(`/settings/models/${id}/archive`),

  setDefaultModel: (id: string) => request.post<{ ok: boolean }>(`/settings/models/${id}/set-default`),
}
