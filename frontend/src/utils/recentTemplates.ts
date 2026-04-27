const KEY = 'tc-recent-templates-v1'
const LIMIT = 6

export function loadRecentTemplateIds(): string[] {
  if (typeof localStorage === 'undefined') return []
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const arr = JSON.parse(raw) as unknown
    if (!Array.isArray(arr)) return []
    return arr.filter((x) => typeof x === 'string' && x.trim()).slice(0, LIMIT)
  } catch {
    return []
  }
}

export function pushRecentTemplateId(id: string) {
  const tid = (id || '').trim()
  if (!tid || typeof localStorage === 'undefined') return
  const prev = loadRecentTemplateIds()
  const next = [tid, ...prev.filter((x) => x !== tid)].slice(0, LIMIT)
  localStorage.setItem(KEY, JSON.stringify(next))
}

