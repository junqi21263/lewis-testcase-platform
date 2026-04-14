import { request } from '@/utils/request'
import type { TestSuite, TestCase, PaginatedData, PaginationParams, ExportFormat } from '@/types'
import { getApiBaseUrl } from '@/utils/apiBaseUrl'

export interface TestcasesSummary {
  totalSuites: number
  totalCases: number
}

export const testcasesApi = {
  // ---- 用例集 ----
  getSummary: () =>
    request.get<TestcasesSummary>('/testcases/summary'),

  getSuites: (params?: PaginationParams & { keyword?: string }) =>
    request.get<PaginatedData<TestSuite>>('/testcases/suites', { params }),

  getSuiteById: (id: string) =>
    request.get<TestSuite>(`/testcases/suites/${id}`),

  createSuite: (data: Partial<TestSuite>) =>
    request.post<TestSuite>('/testcases/suites', data),

  updateSuite: (id: string, data: Partial<TestSuite>) =>
    request.patch<TestSuite>(`/testcases/suites/${id}`, data),

  deleteSuite: (id: string) =>
    request.delete<void>(`/testcases/suites/${id}`),

  // ---- 用例 ----
  getCasesBySuiteId: (suiteId: string) =>
    request.get<TestCase[]>(`/testcases/suites/${suiteId}/cases`),

  updateCase: (id: string, data: Partial<TestCase>) =>
    request.patch<TestCase>(`/testcases/cases/${id}`, data),

  deleteCase: (id: string) =>
    request.delete<void>(`/testcases/cases/${id}`),

  // ---- 导出 ----
  /**
   * 导出用例集：后端是二进制下载（非 JSON），不要走 axios 的统一拦截
   * 直接返回可打开的 URL（浏览器会下载）
   */
  exportSuiteUrl: (suiteId: string, format: ExportFormat) => {
    const base = getApiBaseUrl()
    return `${base}/testcases/suites/${suiteId}/export?format=${encodeURIComponent(format)}`
  },
}
