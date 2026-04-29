import { Moon, Sun, Bell, User, LogOut, ChevronDown } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { useThemeStore } from '@/store/themeStore'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { authApi } from '@/api/auth'
import toast from 'react-hot-toast'
import { WeatherBadge } from '@/components/weather/WeatherBadge'

export default function Header() {
  const navigate = useNavigate()
  const { user, logout } = useAuthStore()
  const { theme, toggleTheme } = useThemeStore()

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

  const initials = user?.username
    ? user.username.slice(0, 2).toUpperCase()
    : 'U'

  return (
    <header className="h-16 flex items-center justify-between px-6 bg-[color:var(--glass-bg)] shadow-[0_12px_40px_-28px_rgba(0,0,0,0.75)] ring-1 ring-inset ring-[color:var(--glass-border)] backdrop-blur-[var(--glass-blur)] backdrop-saturate-150">
      {/* 面包屑或页面标题可在此扩展 */}
      <div className="flex-1" />

      <div className="flex items-center gap-2">
        {/* 消息通知 */}
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="w-5 h-5" />
          <span className="absolute top-2 right-2 w-1.5 h-1.5 bg-red-500 rounded-full" />
        </Button>

        {/* 明暗主题切换 */}
        <Button variant="ghost" size="icon" onClick={toggleTheme}>
          {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
        </Button>

        <WeatherBadge />

        {/* 用户菜单 */}
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button className="flex items-center gap-2 rounded-lg px-2.5 py-2 hover:bg-[color:var(--glass-bg)] hover:backdrop-blur-[var(--glass-blur)] transition-colors">
              <Avatar className="w-8 h-8">
                <AvatarImage src={user?.avatar} />
                <AvatarFallback className="text-xs">{initials}</AvatarFallback>
              </Avatar>
              <span className="text-sm font-medium hidden sm:block">{user?.username}</span>
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            </button>
          </DropdownMenu.Trigger>

          <DropdownMenu.Portal>
            <DropdownMenu.Content
              align="end"
              sideOffset={5}
              className="z-50 w-52 animate-in rounded-lg border-0 bg-[color:var(--glass-bg)] p-1 text-popover-foreground shadow-[0_30px_80px_-48px_rgba(0,0,0,0.7)] ring-1 ring-inset ring-[color:var(--glass-border)] backdrop-blur-[var(--glass-blur)] fade-in-0 zoom-in-95"
            >
              <DropdownMenu.Item
                className="flex items-center gap-2 px-3 py-2 text-sm rounded-md cursor-pointer hover:bg-[color:color-mix(in_srgb,var(--glass-bg),white_6%)] outline-none"
                onClick={() => navigate('/profile')}
              >
                <User className="w-4 h-4" />
                个人中心
              </DropdownMenu.Item>
              <DropdownMenu.Item
                className="flex items-center gap-2 px-3 py-2 text-sm rounded-md cursor-pointer hover:bg-[color:color-mix(in_srgb,var(--glass-bg),white_6%)] outline-none"
                onClick={() => navigate('/settings')}
              >
                个人设置
              </DropdownMenu.Item>
              <DropdownMenu.Separator className="my-1 h-px bg-white/10" />
              <DropdownMenu.Item
                className="flex items-center gap-2 px-3 py-2 text-sm rounded-md cursor-pointer text-destructive hover:bg-[hsl(var(--destructive)/0.12)] outline-none"
                onClick={handleLogout}
              >
                <LogOut className="w-4 h-4" />
                退出登录
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>
    </header>
  )
}
