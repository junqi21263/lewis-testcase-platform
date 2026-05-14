import { Moon, Sun, User, LogOut, ChevronDown, Settings } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useCallback } from 'react'
import { useAuthStore } from '@/store/authStore'
import { useThemeStore } from '@/store/themeStore'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { authApi } from '@/api/auth'
import toast from 'react-hot-toast'
import { WeatherBadge } from '@/components/weather/WeatherBadge'
import { cn } from '@/utils/cn'

function ThemeToggle() {
  const theme = useThemeStore((s) => s.theme)
  const toggleTheme = useThemeStore((s) => s.toggleTheme)

  const onClick = useCallback(() => {
    toggleTheme()
  }, [toggleTheme])

  const isDark = theme === 'dark'

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isDark}
      aria-label="切换深浅模式"
      onClick={onClick}
      className={cn(
        'relative isolate flex h-9 w-[4.5rem] shrink-0 items-center rounded-full border p-1',
        'border-workspace-panel-border/55 bg-workspace-toggle-track/95 backdrop-blur-md',
        'shadow-[0_10px_28px_-14px_rgba(59,130,246,0.22)]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/45 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        'dark:border-white/10 dark:shadow-[0_12px_30px_-14px_rgba(56,189,248,0.28)]',
      )}
    >
      {/* 与滑块圆心对齐：left = padding + 滑块半径；右档 + 平移量 2.25rem 与滑块 translate 一致 */}
      <span
        className="pointer-events-none absolute left-[calc(0.25rem+0.875rem)] top-1/2 z-[2] flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center"
        aria-hidden
      >
        <Sun
          className={cn(
            'h-3.5 w-3.5 shrink-0 transition-opacity duration-200 motion-reduce:transition-none',
            !isDark
              ? 'opacity-100 text-[hsl(var(--workspace-theme-toggle-active-icon))]'
              : 'opacity-[0.88] text-[hsl(var(--workspace-theme-toggle-inactive-icon))]',
          )}
          strokeWidth={2}
        />
      </span>
      <span
        className="pointer-events-none absolute left-[calc(0.25rem+0.875rem+2.25rem)] top-1/2 z-[2] flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center"
        aria-hidden
      >
        <Moon
          className={cn(
            'h-3.5 w-3.5 shrink-0 transition-opacity duration-200 motion-reduce:transition-none',
            isDark
              ? 'opacity-100 text-[hsl(var(--workspace-theme-toggle-active-icon))]'
              : 'opacity-[0.88] text-[hsl(var(--workspace-theme-toggle-inactive-icon))]',
          )}
          strokeWidth={2}
        />
      </span>
      <span
        aria-hidden
        className={cn(
          'pointer-events-none absolute left-1 top-1/2 z-[1] h-7 w-7 -translate-y-1/2 rounded-full bg-workspace-toggle-thumb',
          'shadow-[0_2px_10px_rgba(15,23,42,0.14)] ring-1 ring-black/[0.06]',
          'transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none motion-reduce:duration-0',
          'dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_2px_12px_rgba(0,0,0,0.35)] dark:ring-white/10',
          isDark ? 'translate-x-[2.25rem]' : 'translate-x-0',
        )}
      />
    </button>
  )
}

export default function Header() {
  const navigate = useNavigate()
  const { user, logout } = useAuthStore()

  const handleLogout = async () => {
    try {
      await authApi.logout()
    } catch {
      // 忽略登出接口错误，直接清除本地状态
    } finally {
      logout()
      navigate('/login')
      toast.success('已退出登录')
    }
  }

  const initials = user?.username ? user.username.slice(0, 2).toUpperCase() : 'U'

  const controlPill =
    'rounded-full border border-workspace-panel-border/50 bg-workspace-control/88 text-workspace-text-primary shadow-[0_10px_28px_-18px_rgba(15,23,42,0.12)] backdrop-blur-md transition-[transform,opacity,background-color] duration-200 hover:bg-workspace-control dark:border-white/10 dark:bg-workspace-control/90 dark:text-workspace-text-primary dark:shadow-[0_12px_30px_-18px_rgba(0,0,0,0.45)] motion-reduce:transition-none'

  return (
    <header
      className={cn(
        'h-16 flex items-center justify-between px-6',
        'border-b border-workspace-topbar-border/70 bg-workspace-topbar/80 backdrop-blur-xl backdrop-saturate-150',
        'shadow-[0_14px_36px_-22px_rgba(59,130,246,0.18)] dark:border-white/[0.07] dark:bg-workspace-topbar/75 dark:shadow-[0_16px_40px_-20px_rgba(0,0,0,0.55)]',
      )}
    >
      <div className="flex-1" />

      <div className="flex min-w-0 items-center gap-2">
        <ThemeToggle />

        <WeatherBadge />

        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button
              type="button"
              className={cn(
                'flex max-w-[14rem] items-center gap-2 rounded-full px-2 py-1.5',
                controlPill,
              )}
            >
              <Avatar className="h-8 w-8">
                <AvatarImage src={user?.avatar} />
                <AvatarFallback className="text-xs text-workspace-text-primary">{initials}</AvatarFallback>
              </Avatar>
              <span className="hidden min-w-0 truncate text-sm font-medium text-workspace-text-primary sm:block">
                {user?.username}
              </span>
              <ChevronDown className="h-4 w-4 shrink-0 text-workspace-text-muted" strokeWidth={2} />
            </button>
          </DropdownMenu.Trigger>

          <DropdownMenu.Portal>
            <DropdownMenu.Content
              align="end"
              sideOffset={5}
              className="z-50 w-48 animate-in rounded-md border border-workspace-panel-border/60 bg-workspace-panel/95 p-1 text-workspace-text-primary shadow-xl backdrop-blur-xl fade-in-0 zoom-in-95 dark:border-white/10"
            >
              <DropdownMenu.Item
                className="flex cursor-pointer items-center gap-2 rounded-sm px-3 py-2 text-sm outline-none hover:bg-workspace-panel-muted/90 focus:bg-workspace-panel-muted/90"
                onClick={() => navigate('/profile')}
              >
                <User className="h-4 w-4" />
                个人中心
              </DropdownMenu.Item>
              <DropdownMenu.Item
                className="flex cursor-pointer items-center gap-2 rounded-sm px-3 py-2 text-sm outline-none hover:bg-workspace-panel-muted/90 focus:bg-workspace-panel-muted/90"
                onClick={() => navigate('/settings')}
              >
                <Settings className="h-4 w-4" />
                个人设置
              </DropdownMenu.Item>
              <DropdownMenu.Separator className="my-1 h-px bg-workspace-panel-border/60" />
              <DropdownMenu.Item
                className="flex cursor-pointer items-center gap-2 rounded-sm px-3 py-2 text-sm text-destructive outline-none hover:bg-destructive/10 focus:bg-destructive/10"
                onClick={handleLogout}
              >
                <LogOut className="h-4 w-4" />
                退出登录
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>
    </header>
  )
}
