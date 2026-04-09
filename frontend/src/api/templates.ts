import { request } from '@/utils/request'
import type { PromptTemplate, PaginatedData, PaginationParams } from '@/types'

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
}
