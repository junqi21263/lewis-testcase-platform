import { Cloud, Moon, Sparkles, Sun } from 'lucide-react'
import { useThemeStore } from '@/store/themeStore'
import { cn } from '@/utils/cn'

/**
 * 登录页右上角主题切换：胶囊滑轨 + 图标淡入旋转，接入 themeStore（持久化 theme-storage）。
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
        'login-theme-toggle group/tog relative flex h-10 w-[4.25rem] shrink-0 items-center rounded-full sm:h-11 sm:w-[4.75rem]',
        'border border-[var(--lp-toggle-border)] bg-[var(--lp-toggle-bg)] shadow-[var(--lp-toggle-shadow)]',
        'backdrop-blur-xl transition-[transform,box-shadow] duration-300 ease-out',
        'hover:-translate-y-px hover:shadow-[var(--lp-toggle-shadow-hover)]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/45 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--lp-page-base,transparent)]',
        'motion-reduce:transition-none motion-reduce:hover:translate-y-0',
        className,
      )}
    >
      <span
        className={cn(
          'login-theme-toggle-thumb absolute left-0.5 top-0.5 flex h-8 w-8 items-center justify-center rounded-full sm:left-1 sm:top-1 sm:h-9 sm:w-9',
          'bg-gradient-to-br from-white/95 to-white/75 shadow-md ring-1 ring-black/[0.06]',
          'transition-transform duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)]',
          isDark ? 'translate-x-[2.05rem] sm:translate-x-[2.35rem]' : 'translate-x-0',
        )}
      >
        <span
          className={cn(
            'absolute inset-0 flex items-center justify-center transition-[opacity,transform] duration-300',
            isDark ? 'scale-90 opacity-0 rotate-90' : 'scale-100 opacity-100 rotate-0',
          )}
          aria-hidden
        >
          <Sun className="h-4 w-4 text-amber-500 sm:h-[1.05rem] sm:w-[1.05rem]" strokeWidth={1.75} />
        </span>
        <span
          className={cn(
            'absolute inset-0 flex items-center justify-center transition-[opacity,transform] duration-300',
            isDark ? 'scale-100 opacity-100 rotate-0' : 'scale-90 opacity-0 -rotate-90',
          )}
          aria-hidden
        >
          <Moon className="h-4 w-4 text-indigo-500 sm:h-[1.05rem] sm:w-[1.05rem]" strokeWidth={1.75} />
        </span>
      </span>
      <span className="pointer-events-none absolute inset-0 flex items-center justify-between px-2.5 text-[var(--lp-toggle-icon-muted)] sm:px-3">
        <Cloud className="h-3.5 w-3.5 opacity-70 sm:h-4 sm:w-4" strokeWidth={1.5} aria-hidden />
        <Sparkles className="h-3.5 w-3.5 opacity-70 sm:h-4 sm:w-4" strokeWidth={1.5} aria-hidden />
      </span>
    </button>
  )
}
