const KEY = 'tc-gen-prefs'

export interface GenPrefs {
  defaultTemperature: number
  defaultMaxTokens: number
}

const defaults: GenPrefs = {
  defaultTemperature: 0.7,
  defaultMaxTokens: 32768,
}

function clampNumber(value: unknown, fallback: number, min: number, max: number, integer = false): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return fallback
  const normalized = integer ? Math.floor(n) : n
  return Math.min(Math.max(normalized, min), max)
}

export function normalizeGenPrefs(p: Partial<GenPrefs> | null | undefined): GenPrefs {
  return {
    defaultTemperature: clampNumber(p?.defaultTemperature, defaults.defaultTemperature, 0, 2),
    defaultMaxTokens: clampNumber(p?.defaultMaxTokens, defaults.defaultMaxTokens, 256, 128000, true),
  }
}

export function loadGenPrefs(): GenPrefs {
  if (typeof localStorage === 'undefined') return { ...defaults }
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...defaults }
    const p = JSON.parse(raw) as Partial<GenPrefs>
    return normalizeGenPrefs(p)
  } catch {
    return { ...defaults }
  }
}

export function saveGenPrefs(p: GenPrefs) {
  localStorage.setItem(KEY, JSON.stringify(normalizeGenPrefs(p)))
}
