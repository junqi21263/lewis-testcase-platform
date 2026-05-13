import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type Theme = 'light' | 'dark'

const STORAGE_KEY = 'theme-storage'

function preferredThemeFromSystem(): Theme {
  if (typeof window === 'undefined') return 'dark'
  if (typeof window.matchMedia !== 'function') return 'dark'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

/** 与 zustand persist 结构一致，首帧同步读，避免闪屏与开关状态错位 */
function readPersistedTheme(): Theme | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { state?: { theme?: unknown } }
    const t = parsed?.state?.theme
    return t === 'light' || t === 'dark' ? t : null
  } catch {
    return null
  }
}

function resolveInitialTheme(): Theme {
  return readPersistedTheme() ?? preferredThemeFromSystem()
}

interface ThemeState {
  theme: Theme
  toggleTheme: () => void
  setTheme: (theme: Theme) => void
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: resolveInitialTheme(),
      toggleTheme: () => set((state) => ({ theme: state.theme === 'light' ? 'dark' : 'light' })),
      setTheme: (theme) => set({ theme }),
    }),
    { name: STORAGE_KEY },
  ),
)
