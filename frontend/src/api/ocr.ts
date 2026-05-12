import { getApiBaseUrl } from '@/utils/apiBaseUrl'
import { useAuthStore } from '@/store/authStore'
import type { ApiResponse } from '@/types'

export interface OcrUploadResponse {
  taskId: string
}

export interface OcrTaskStatusPayload {
  id: string
  userId: string
  status: 'PENDING' | 'PROCESSING' | 'SUCCESS' | 'FAILED'
  progress: number
  result?: string
  error?: string
  createdAt: number
  updatedAt: number
}

/** POST /api/ocr/upload：独立异步 OCR（与 files 上传并存） */
export async function ocrUploadImage(file: File): Promise<OcrUploadResponse> {
  const token = useAuthStore.getState().token
  const base = getApiBaseUrl()
  const fd = new FormData()
  fd.append('file', file)
  const res = await fetch(`${base}/ocr/upload`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: fd,
  })
  const j = (await res.json()) as ApiResponse<OcrUploadResponse>
  if (!res.ok || j.code !== 0 || !j.data?.taskId) {
    throw new Error((j as { message?: string }).message || `HTTP ${res.status}`)
  }
  return j.data
}

/** GET /api/ocr/status/:taskId */
export async function ocrGetTaskStatus(taskId: string): Promise<OcrTaskStatusPayload> {
  const token = useAuthStore.getState().token
  const base = getApiBaseUrl()
  const res = await fetch(`${base}/ocr/status/${encodeURIComponent(taskId)}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  const j = (await res.json()) as ApiResponse<OcrTaskStatusPayload>
  if (!res.ok || j.code !== 0 || !j.data) {
    throw new Error((j as { message?: string }).message || `HTTP ${res.status}`)
  }
  return j.data
}

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms))
}

/**
 * 轮询任务直到终态（浏览器 EventSource 无法带 Bearer，故独立 OCR 用轮询；与 SSE 等价体验）。
 */
export async function ocrPollTaskUntilDone(
  taskId: string,
  onPayload?: (p: OcrTaskStatusPayload) => void,
  opts?: { intervalMs?: number; signal?: AbortSignal },
): Promise<OcrTaskStatusPayload> {
  const interval = opts?.intervalMs ?? 800
  for (;;) {
    if (opts?.signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    const p = await ocrGetTaskStatus(taskId)
    onPayload?.(p)
    if (p.status === 'SUCCESS' || p.status === 'FAILED') return p
    await sleep(interval)
  }
}
