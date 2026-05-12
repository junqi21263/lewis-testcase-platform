import { request } from '@/utils/request'
import { getApiBaseUrl } from '@/utils/apiBaseUrl'

export type UsageSummary = {
  today: { calls: number; tokens: number; costCny: number }
  month: { calls: number; tokens: number; costCny: number }
  fileTypeDistribution: Array<{ fileKind: string; count: number }>
  moduleDistribution: Array<{ moduleType: string; count: number }>
}

export type UsageDetails = {
  list: Array<{
    id: string
    moduleType: string
    fileKind: string
    provider?: string | null
    modelName?: string | null
    promptTokens: number
    completionTokens: number
    totalTokens: number
    estimatedCostCny: number
    cacheHit: boolean
    success: boolean
    errorMessage?: string | null
    createdAt: string
  }>
  total: number
  page: number
  pageSize: number
}

export const usageApi = {
  getSummary: () => request.get<UsageSummary>('/usage/summary'),
  getDetails: (page = 1, pageSize = 20) =>
    request.get<UsageDetails>('/usage/details', { params: { page, pageSize } }),
  exportCsvUrl: () => `${getApiBaseUrl()}/usage/export.csv`,
}
