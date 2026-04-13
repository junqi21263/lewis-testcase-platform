const KEY = 'tc-gen-prefs'

export interface GenPrefs {
  defaultTemperature: number
  defaultMaxTokens: number
}

const defaults: GenPrefs = {
  defaultTemperature: 0.7,
  defaultMaxTokens: 4096,
}

export function loadGenPrefs(): GenPrefs {
  if (typeof localStorage === 'undefined') return { ...defaults }
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...defaults }
    const p = JSON.parse(raw) as Partial<GenPrefs>
    return {
      defaultTemperature: typeof p.defaultTemperature === 'number' ? p.defaultTemperature : defaults.defaultTemperature,
      defaultMaxTokens: typeof p.defaultMaxTokens === 'number' ? p.defaultMaxTokens : defaults.defaultMaxTokens,
    }
  } catch {
    return { ...defaults }
  }
}

export function saveGenPrefs(p: GenPrefs) {
  localStorage.setItem(KEY, JSON.stringify(p))
}
