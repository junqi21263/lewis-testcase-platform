/**
 * safeRandomUUID
 * - Prefer `crypto.randomUUID()` when available (secure contexts / modern browsers)
 * - Fallback to RFC4122 v4 using `crypto.getRandomValues`
 * - Last resort: pseudo-random string (still stable enough for client-only ids)
 */
export function safeRandomUUID(): string {
  const g = globalThis as unknown as {
    crypto?: {
      randomUUID?: () => string
      getRandomValues?: (arr: Uint8Array) => Uint8Array
    }
  }

  try {
    if (g.crypto?.randomUUID) return g.crypto.randomUUID()
  } catch {
    // ignore
  }

  const bytes = new Uint8Array(16)
  try {
    if (g.crypto?.getRandomValues) {
      g.crypto.getRandomValues(bytes)
      // RFC4122 v4
      bytes[6] = (bytes[6] & 0x0f) | 0x40
      bytes[8] = (bytes[8] & 0x3f) | 0x80
      const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0'))
      return (
        hex.slice(0, 4).join('') +
        '-' +
        hex.slice(4, 6).join('') +
        '-' +
        hex.slice(6, 8).join('') +
        '-' +
        hex.slice(8, 10).join('') +
        '-' +
        hex.slice(10, 16).join('')
      )
    }
  } catch {
    // ignore
  }

  const s = `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}-${Math.random()
    .toString(16)
    .slice(2)}`
  return `fallback-${s}`
}

