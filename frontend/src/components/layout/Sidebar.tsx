import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  Wand2,
  ClipboardList,
  BookTemplate,
  Users,
  Settings,
  ChevronLeft,
  ChevronRight,
  FileUp,
  Brain,
  BarChart3,
} from 'lucide-react'
import { cn } from '@/utils/cn'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { FriendlyBrandIcon } from '@/components/brand/FriendlyBrandIcon'

const navItems = [
  { path: '/dashboard', icon: LayoutDashboard, label: '工作台' },
  { path: '/upload', icon: FileUp, label: '文档解析' },
  { path: '/ai-analysis', icon: Brain, label: 'AI 需求分析' },
  { path: '/generate', icon: Wand2, label: '生成用例' },
  { path: '/records', icon: ClipboardList, label: '生成记录' },
  { path: '/templates', icon: BookTemplate, label: '模板管理' },
  { path: '/teams', icon: Users, label: '团队管理' },
  { path: '/usage-stats', icon: BarChart3, label: '用量统计' },
]

const bottomItems = [
  { path: '/settings', icon: Settings, label: '系统设置' },
]

function sidebarNavClassNames(isActive: boolean, collapsed: boolean) {
  return cn(
    'flex items-center gap-3 rounded-lg px-3.5 py-3 text-sm font-medium outline-none transition-[transform,background-color,color,box-shadow] duration-200 ease-out motion-reduce:transition-none',
    'min-h-11 touch-manipulation [-webkit-tap-highlight-color:transparent]',
    'focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar',
    'hover:scale-[1.01] active:scale-[0.99] motion-reduce:hover:scale-100 motion-reduce:active:scale-100',
    isActive
      ? 'bg-sidebar-accent/92 text-sidebar-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_12px_28px_-18px_rgba(56,189,248,0.55)] ring-1 ring-white/10'
      : 'text-sidebar-foreground/72 hover:bg-sidebar-accent/55 hover:text-sidebar-accent-foreground',
    collapsed && 'justify-center px-2',
  )
}

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <aside
      className={cn(
        'relative z-10 flex flex-col overflow-hidden bg-sidebar/88 text-sidebar-foreground shadow-[10px_0_44px_-26px_rgba(15,23,42,0.45)] backdrop-blur-2xl transition-all duration-300 supports-[backdrop-filter]:bg-sidebar/82 dark:shadow-[10px_0_48px_-20px_rgba(0,0,0,0.75)]',
        collapsed ? 'w-16' : 'w-60',
      )}
    >
      <div className="pointer-events-none absolute -left-20 top-0 h-52 w-52 rounded-full bg-cyan-300/12 blur-3xl dark:bg-cyan-400/10" />
      <div className="pointer-events-none absolute -bottom-24 right-0 h-56 w-56 rounded-full bg-violet-300/12 blur-3xl dark:bg-violet-500/10" />
      {/* Logo */}
      <div className="relative flex h-16 items-center gap-3 px-4 py-5">
        <FriendlyBrandIcon size="sm" />
        {!collapsed && (
          <div className="min-w-0">
            <span className="block truncate text-base font-bold leading-tight text-sidebar-foreground">
              AI 用例平台
            </span>
            <span className="block truncate text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-200/65">
              Friendly workspace
            </span>
          </div>
        )}
      </div>

      <div className="h-px w-[88%] mx-auto shrink-0 bg-gradient-to-r from-transparent via-sidebar-foreground/14 to-transparent" />

      {/* 主导航 */}
      <nav className="flex-1 px-2 py-4 space-y-1 overflow-y-auto min-h-0">
        {navItems.map((item) => {
          const NavIcon = item.icon
          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) => sidebarNavClassNames(isActive, collapsed)}
              title={collapsed ? item.label : undefined}
            >
              <NavIcon className="w-5 h-5 flex-shrink-0" />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </NavLink>
          )
        })}
      </nav>

      <div className="h-px w-[88%] mx-auto shrink-0 bg-gradient-to-r from-transparent via-sidebar-foreground/14 to-transparent" />

      {/* 底部导航 */}
      <div className="shrink-0 px-2 pb-4 pt-2 space-y-1">
        {bottomItems.map((item) => {
          const NavIcon = item.icon
          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) => sidebarNavClassNames(isActive, collapsed)}
              title={collapsed ? item.label : undefined}
            >
              <NavIcon className="w-5 h-5 flex-shrink-0" />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </NavLink>
          )
        })}
      </div>

      {/* 折叠按钮：44×44 命中区，与侧栏玻璃风格一致 */}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-expanded={!collapsed}
        aria-label={collapsed ? '展开侧边栏' : '收起侧边栏'}
        onClick={() => setCollapsed(!collapsed)}
        className={cn(
          'absolute -right-[17px] top-[4.5rem] z-10 h-11 w-11 rounded-full',
          'bg-sidebar-accent/85 text-sidebar-foreground shadow-md backdrop-blur-sm',
          'transition-[transform,background-color] duration-200 ease-out',
          'hover:bg-sidebar-accent hover:scale-105 active:scale-95',
          'motion-reduce:transition-none motion-reduce:hover:scale-100 motion-reduce:active:scale-100',
          'focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-offset-2 focus-visible:ring-offset-transparent',
        )}
      >
        {collapsed ? <ChevronRight className="size-4" /> : <ChevronLeft className="size-4" />}
      </Button>
    </aside>
  )
}
