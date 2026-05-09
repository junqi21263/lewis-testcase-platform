/**
 * 记住浏览器侧选择的原始文件名（localStorage），列表展示时优先于服务端 originalName，
 * 避免网关/存储链路把 UTF-8 误解码造成的乱码。
 */
const STORAGE_KEY = 'upload-original-names-v1'
const MAX_ENTRIES = 200

function loadMap(): Record<string, string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const o = JSON.parse(raw) as unknown
    return o && typeof o === 'object' && !Array.isArray(o) ? (o as Record<string, string>) : {}
  } catch {
    return {}
  }
}

export function stashUploadedOriginalName(fileId: string, clientName: string): void {
  if (!fileId || !clientName?.trim()) return
  try {
    const map = loadMap()
    map[fileId] = clientName.trim()
    const keys = Object.keys(map)
    if (keys.length > MAX_ENTRIES) {
      for (const k of keys.slice(0, keys.length - MAX_ENTRIES)) {
        delete map[k]
      }
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
  } catch {
    /* 隐私模式 / 配额 */
  }
}

export function getClientOriginalName(fileId: string): string | undefined {
  const map = loadMap()
  return map[fileId]
}
