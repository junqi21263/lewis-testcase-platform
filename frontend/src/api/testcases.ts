import axios from 'axios'
import { request } from '@/utils/request'
import { useAuthStore } from '@/store/authStore'
import { getApiBaseUrl } from '@/utils/apiBaseUrl'
import type { TestSuite, TestCase, PaginatedData, PaginationParams, ExportFormat } from '@/types'

export interface TestcasesSummary {
  totalSuites: number
  totalCases: number
}

export interface CreateTestCasePayload {
  title: string
  expectedResult: string
  description?: string
  precondition?: string
  steps?: { order: number; action: string; expected?: string }[]
  priority?: TestCase['priority']
  type?: TestCase['type']
}

/** 导出用例集文件（后端直接返回二进制流） */
export async function downloadSuiteExport(
  suiteId: string,
  format: ExportFormat | string,
): Promise<void> {
  const token = useAuthStore.getState().token
  const res = await axios.get<Blob>(
    `${getApiBaseUrl()}/testcases/suites/${suiteId}/export`,
    {
      params: { format },
      responseType: 'blob',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    },
  )
  const cd = res.headers['content-disposition'] as string | undefined
  let filename = `suite-${suiteId}.${String(format).toLowerCase()}`
  if (cd) {
    const m = /filename\*=UTF-8''([^;\n]+)|filename="([^"]+)"/i.exec(cd)
    const raw = m?.[1] ?? m?.[2]
    if (raw) {
      try {
        filename = decodeURIComponent(raw.trim())
      } catch {
        filename = raw.trim()
      }
    }
  }
  const url = URL.createObjectURL(res.data)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
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

  createCase: (suiteId: string, data: CreateTestCasePayload) =>
    request.post<TestCase>(`/testcases/suites/${suiteId}/cases`, data),

  // ---- 导出 ----
  /** @deprecated 后端返回文件流，请使用 downloadSuiteExport */
  exportSuite: (suiteId: string, format: ExportFormat) =>
    request.get<{ downloadUrl: string }>(`/testcases/suites/${suiteId}/export`, {
      params: { format },
    }),
}
