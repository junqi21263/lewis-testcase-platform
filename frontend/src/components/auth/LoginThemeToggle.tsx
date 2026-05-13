import { Cloud, Moon, Sparkles, Sun } from 'lucide-react'
import { useThemeStore } from '@/store/themeStore'
import { cn } from '@/utils/cn'

/**
 * 登录页右上角主题切换：轨道内 inset 布局 + translate 用 calc(100% - thumb) 贴合不溢出。
 */
export function LoginThemeToggle({ className }: { className?: string }) {
  const theme = useThemeStore((s) => s.theme)
  const toggleTheme = useThemeStore((s) => s.toggleTheme)
  const isDark = theme === 'dark'

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isDark ? '切换到浅色模式' : '切换到深色模式'}
      aria-pressed={isDark}
      className={cn(
        'login-theme-toggle group/tog relative isolate box-border h-10 w-[4.5rem] shrink-0 overflow-hidden rounded-full sm:h-11 sm:w-[4.875rem]',
        'border border-[var(--lp-toggle-border)] bg-[var(--lp-toggle-bg)] shadow-[var(--lp-toggle-shadow)]',
        'backdrop-blur-xl transition-[transform,box-shadow] duration-300 ease-out',
        'hover:-translate-y-px hover:shadow-[var(--lp-toggle-shadow-hover)]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/45 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--lp-page-base,transparent)]',
        'motion-reduce:transition-none motion-reduce:hover:translate-y-0',
        className,
      )}
    >
      {/* 轨道：与边框留出统一 inset，拇指 translate 的 100% 即此区域宽度，避免溢出 */}
      <div className="absolute inset-1 overflow-hidden rounded-full">
        <span className="absolute inset-0 z-0 flex items-center justify-between px-1 text-[var(--lp-toggle-icon-muted)] sm:px-1.5">
          <Cloud className="h-3.5 w-3.5 shrink-0 opacity-70 sm:h-4 sm:w-4" strokeWidth={1.5} aria-hidden />
          <Sparkles className="h-3.5 w-3.5 shrink-0 opacity-70 sm:h-4 sm:w-4" strokeWidth={1.5} aria-hidden />
        </span>
        <span
          className={cn(
            'login-theme-toggle-thumb pointer-events-none absolute top-1/2 z-[1] flex h-8 w-8 -translate-y-1/2 items-center justify-center overflow-hidden rounded-full',
            'bg-gradient-to-br from-white/95 to-white/75 shadow-md ring-1 ring-black/[0.06]',
            /* left 的 % 相对轨道（定位父级）；勿用 translate-x(100%-thumb)，其 % 相对拇指自身宽度会恒为 0 */
            'transition-[left,transform] duration-500 ease-out motion-reduce:transition-none',
            'sm:h-9 sm:w-9',
            isDark
              ? 'left-[calc(100%-2rem)] sm:left-[calc(100%-2.25rem)]'
              : 'left-0',
          )}
          aria-hidden
        >
          {isDark ? (
            <Moon
              key="theme-moon"
              className="pointer-events-none h-4 w-4 shrink-0 animate-in fade-in-0 zoom-in-95 text-indigo-500 duration-200 sm:h-[1.05rem] sm:w-[1.05rem]"
              strokeWidth={1.75}
              aria-hidden
            />
          ) : (
            <Sun
              key="theme-sun"
              className="pointer-events-none h-4 w-4 shrink-0 animate-in fade-in-0 zoom-in-95 text-amber-500 duration-200 sm:h-[1.05rem] sm:w-[1.05rem]"
              strokeWidth={1.75}
              aria-hidden
            />
          )}
        </span>
      </div>
    </button>
  )
}
