import axios, { type AxiosInstance, type AxiosRequestConfig, type AxiosResponse } from 'axios'
import toast from 'react-hot-toast'
import { useAuthStore } from '@/store/authStore'
import type { ApiResponse } from '@/types'
import { getApiBaseUrl } from '@/utils/apiBaseUrl'

type ErrorResponseData = Partial<{
  code: number
  message: string | string[]
  data: unknown
  timestamp: string
  path: string
}>

function extractErrorMessage(data: unknown, fallback: string): string {
  if (!data || typeof data !== 'object') return fallback
  const message = (data as ErrorResponseData).message
  if (Array.isArray(message)) return message[0] || fallback
  if (typeof message === 'string' && message.trim()) return message
  return fallback
}

function isAuthEntryRequest(url?: string): boolean {
  if (!url) return false
  return url.includes('/auth/login') || url.includes('/auth/register')
}

/** 创建 axios 实例 */
const instance: AxiosInstance = axios.create({
  baseURL: getApiBaseUrl(),
  timeout: 60000,
  headers: {
    'Content-Type': 'application/json',
  },
})

/** 请求拦截器：自动携带 JWT Token */
instance.interceptors.request.use(
  (config) => {
    const token = useAuthStore.getState().token
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => Promise.reject(error),
)

/** 响应拦截器：HTTP 200 但 body.code 非成功时，按业务错误处理（与后端统一报文约定一致） */
instance.interceptors.response.use(
  (response: AxiosResponse<ApiResponse>) => {
    const { data } = response
    const code = data.code
    if (code === 0 || code === 200) {
      return response
    }

    const requestUrl = response.config?.url as string | undefined
    const msg =
      typeof data.message === 'string' && data.message.trim()
        ? data.message
        : '请求失败'

    if (code === 401) {
      if (isAuthEntryRequest(requestUrl)) {
        toast.error(extractErrorMessage(data, '用户名或密码错误'))
      } else if (useAuthStore.getState().token) {
        useAuthStore.getState().logout()
        toast.error(extractErrorMessage(data, '登录已过期，请重新登录'))
        if (window.location.pathname !== '/login') {
          window.location.href = '/login'
        }
      } else {
        toast.error(extractErrorMessage(data, '未授权访问'))
      }
    } else if (code === 403) {
      toast.error(extractErrorMessage(data, '权限不足，无法执行此操作'))
    } else if (code === 404) {
      toast.error(extractErrorMessage(data, '请求的资源不存在'))
    } else if (code === 409) {
      toast.error(extractErrorMessage(data, '数据冲突，请检查后重试'))
    } else if (code === 429) {
      toast.error(extractErrorMessage(data, '请求过于频繁，请稍后再试'))
    } else if (code >= 500) {
      toast.error(extractErrorMessage(data, '服务器内部错误'))
    } else {
      toast.error(extractErrorMessage(data, msg))
    }

    const err = Object.assign(new Error(msg), { response }) as Error & {
      response: AxiosResponse<ApiResponse>
    }
    return Promise.reject(err)
  },
  (error) => {
    if (error.response) {
      const { status, data } = error.response
      const requestUrl = error.config?.url as string | undefined
      const hasToken = !!useAuthStore.getState().token
      switch (status) {
        case 400:
          toast.error(extractErrorMessage(data, '请求参数错误'))
          break
        case 401:
          if (isAuthEntryRequest(requestUrl)) {
            toast.error(extractErrorMessage(data, '用户名或密码错误'))
            break
          }
          if (hasToken) {
            useAuthStore.getState().logout()
            toast.error(extractErrorMessage(data, '登录已过期，请重新登录'))
            if (window.location.pathname !== '/login') {
              window.location.href = '/login'
            }
            break
          }
          toast.error(extractErrorMessage(data, '未授权访问'))
          break
        case 403:
          toast.error(extractErrorMessage(data, '权限不足，无法执行此操作'))
          break
        case 404:
          toast.error(extractErrorMessage(data, '请求的资源不存在'))
          break
        case 409:
          toast.error(extractErrorMessage(data, '数据冲突，请检查后重试'))
          break
        case 429:
          toast.error(extractErrorMessage(data, '请求过于频繁，请稍后再试'))
          break
        case 500:
          toast.error(extractErrorMessage(data, '服务器内部错误'))
          break
        default:
          toast.error(extractErrorMessage(data, '网络异常，请稍后重试'))
      }
    } else if (error.request) {
      toast.error('网络连接失败，请检查网络')
    }
    return Promise.reject(error)
  },
)

/** 封装请求方法，自动提取 data 字段 */
export const request = {
  get<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    return instance.get<ApiResponse<T>>(url, config).then((res) => res.data.data)
  },
  post<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
    return instance.post<ApiResponse<T>>(url, data, config).then((res) => res.data.data)
  },
  put<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
    return instance.put<ApiResponse<T>>(url, data, config).then((res) => res.data.data)
  },
  patch<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
    return instance.patch<ApiResponse<T>>(url, data, config).then((res) => res.data.data)
  },
  delete<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    return instance.delete<ApiResponse<T>>(url, config).then((res) => res.data.data)
  },
}

/** 流式结束元信息（后端在 [DONE] 前下发） */
export type StreamDoneMeta = {
  recordId?: string
  suiteId?: string
  caseCount?: number
}

/** 流式请求（SSE），用于 AI 生成流式响应 */
export async function streamRequest(
  url: string,
  data: unknown,
  onChunk: (chunk: string) => void,
  onDone?: (meta?: StreamDoneMeta) => void,
  onError?: (error: Error) => void,
): Promise<void> {
  const token = useAuthStore.getState().token
  const baseURL = getApiBaseUrl()

  const response = await fetch(`${baseURL}${url}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: token ? `Bearer ${token}` : '',
    },
    body: JSON.stringify(data),
  })

  if (!response.ok) {
    const error = new Error(`HTTP ${response.status}: ${response.statusText}`)
    onError?.(error)
    return
  }

  const reader = response.body?.getReader()
  if (!reader) return

  const decoder = new TextDecoder()
  let sseBuffer = ''
  let doneMeta: StreamDoneMeta | undefined
  let finished = false

  const finish = (meta?: StreamDoneMeta) => {
    if (finished) return
    finished = true
    onDone?.(meta ?? doneMeta)
  }

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) {
        finish()
        break
      }
      sseBuffer += decoder.decode(value, { stream: true })
      const lines = sseBuffer.split('\n')
      sseBuffer = lines.pop() ?? ''

      for (const line of lines) {
        const trimmed = line.replace(/\r$/, '').trim()
        if (!trimmed.startsWith('data: ')) continue
        const jsonStr = trimmed.slice(6).trim()
        if (jsonStr === '[DONE]') {
          finish(doneMeta)
          return
        }
        let obj: unknown
        try {
          obj = JSON.parse(jsonStr)
        } catch {
          continue
        }
        if (!obj || typeof obj !== 'object') continue
        const rec = obj as Record<string, unknown>
        if (typeof rec.content === 'string' && rec.content.length > 0) {
          onChunk(rec.content)
        }
        if (typeof rec.error === 'string') {
          onError?.(new Error(rec.error))
          return
        }
        if (typeof rec.recordId === 'string') {
          doneMeta = { ...doneMeta, recordId: rec.recordId }
        }
        if (typeof rec.suiteId === 'string') {
          doneMeta = { ...doneMeta, suiteId: rec.suiteId }
        }
        if (typeof rec.caseCount === 'number') {
          doneMeta = { ...doneMeta, caseCount: rec.caseCount }
        }
      }
    }
  } catch (err) {
    onError?.(err as Error)
  } finally {
    reader.releaseLock()
  }
}

export default instance
