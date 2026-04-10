import axios, { type AxiosInstance, type AxiosRequestConfig, type AxiosResponse } from 'axios'
import toast from 'react-hot-toast'
import { useAuthStore } from '@/store/authStore'
import type { ApiResponse } from '@/types'
import { getApiBaseUrl } from '@/utils/apiBaseUrl'

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

/** 响应拦截器：统一处理错误 */
instance.interceptors.response.use(
  (response: AxiosResponse<ApiResponse>) => {
    const { data } = response
    // 业务错误码处理
    if (data.code !== 0 && data.code !== 200) {
      toast.error(data.message || '请求失败')
      return Promise.reject(new Error(data.message))
    }
    return response
  },
  (error) => {
    if (error.response) {
      const { status, data } = error.response
      switch (status) {
        case 401:
          // Token 过期，清除登录状态
          useAuthStore.getState().logout()
          toast.error('登录已过期，请重新登录')
          window.location.href = '/login'
          break
        case 403:
          toast.error('权限不足，无法执行此操作')
          break
        case 404:
          toast.error('请求的资源不存在')
          break
        case 500:
          toast.error(data?.message || '服务器内部错误')
          break
        default:
          toast.error(data?.message || '网络异常，请稍后重试')
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

/** 流式请求（SSE），用于 AI 生成流式响应 */
export async function streamRequest(
  url: string,
  data: unknown,
  onChunk: (chunk: string) => void,
  onDone?: () => void,
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
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) {
        onDone?.()
        break
      }
      const chunk = decoder.decode(value, { stream: true })
      // 解析 SSE 格式：data: {...}
      const lines = chunk.split('\n').filter((line) => line.startsWith('data: '))
      for (const line of lines) {
        const jsonStr = line.slice(6).trim()
        if (jsonStr === '[DONE]') {
          onDone?.()
          return
        }
        onChunk(jsonStr)
      }
    }
  } catch (err) {
    onError?.(err as Error)
  } finally {
    reader.releaseLock()
  }
}

export default instance
