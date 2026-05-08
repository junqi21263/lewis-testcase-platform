import { getApiBaseUrl } from '@/utils/apiBaseUrl'
import { useAuthStore } from '@/store/authStore'

/** POST `data:` JSON 行；与后端 GET /files/:id/parse-events 对齐 */
export function subscribeFileParseEvents(
  fileId: string,
  onPayload: (payload: {
    status: string
    parseStage: string | null
    parseProgress: unknown
    parseError: string | null
  }) => void,
  opts?: { signal?: AbortSignal },
): void {
  const token = useAuthStore.getState().token
  const base = getApiBaseUrl()
  void fetch(`${base}/files/${fileId}/parse-events`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    signal: opts?.signal,
  })
    .then(async (res) => {
      if (!res.ok || !res.body) return
      const reader = res.body.getReader()
      const dec = new TextDecoder()
      let carry = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        carry += dec.decode(value, { stream: true })
        const parts = carry.split('\n\n')
        carry = parts.pop() ?? ''
        for (const block of parts) {
          const line = block.trim().split('\n').find((l) => l.startsWith('data:'))
          if (!line) continue
          const json = line.replace(/^data:\s*/, '').trim()
          try {
            onPayload(JSON.parse(json))
          } catch {
            /* ignore */
          }
        }
      }
    })
    .catch(() => {
      /* 取消或网络错误：静默，仍可依賴轮询 */
    })
}
