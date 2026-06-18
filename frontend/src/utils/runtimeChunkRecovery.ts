const RECOVERY_KEY = 'runtime-chunk-recovery-reloaded-at'
const RECOVERY_WINDOW_MS = 30_000

export function isRecoverableChunkError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  const message = `${error.name || ''} ${error.message || ''}`.toLowerCase()
  return (
    message.includes('chunkloaderror') ||
    message.includes('loading chunk') ||
    message.includes('dynamically imported module') ||
    message.includes('importing a module script failed') ||
    message.includes('failed to fetch module script')
  )
}

export function tryRecoverFromChunkError(error: unknown): boolean {
  if (!isRecoverableChunkError(error)) return false
  if (typeof window === 'undefined') return false

  const now = Date.now()
  const last = Number(window.sessionStorage.getItem(RECOVERY_KEY) || '0')
  if (Number.isFinite(last) && now - last < RECOVERY_WINDOW_MS) return false

  window.sessionStorage.setItem(RECOVERY_KEY, String(now))
  window.location.reload()
  return true
}
