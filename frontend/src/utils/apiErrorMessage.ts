import type { AxiosError } from 'axios'

/** 解析后端统一错误体或 class-validator 数组 message */
export function getApiErrorMessage(error: unknown, fallback: string): string {
  const ax = error as AxiosError<{
    message?: string | string[]
    data?: { message?: string }
  }>
  const data = ax.response?.data
  if (!data || typeof data !== 'object') {
    if (ax.message && ax.message !== 'Error') return ax.message
    return fallback
  }
  const raw = data.message
  if (Array.isArray(raw)) {
    const first = raw.find((m) => typeof m === 'string' && m.trim())
    return (first as string) || fallback
  }
  if (typeof raw === 'string' && raw.trim()) return raw.trim()
  return fallback
}
