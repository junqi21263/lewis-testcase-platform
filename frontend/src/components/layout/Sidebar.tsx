import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  Wand2,
  ClipboardList,
  ClipboardCheck,
  BookTemplate,
  Users,
  Settings,
  ChevronLeft,
  ChevronRight,
  Brain,
  BarChart3,
} from 'lucide-react'
import { cn } from '@/utils/cn'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { FriendlyBrandIcon } from '@/components/brand/FriendlyBrandIcon'

const navItems = [
  { path: '/dashboard', icon: LayoutDashboard, label: '工作台' },
  { path: '/ai-analysis', icon: Brain, label: 'AI 需求分析' },
  { path: '/generate', icon: Wand2, label: '生成用例' },
  { path: '/records', icon: ClipboardList, label: '生成记录' },
  { path: '/reviews', icon: ClipboardCheck, label: '用例评审' },
  { path: '/templates', icon: BookTemplate, label: '模板管理' },
  { path: '/teams', icon: Users, label: '团队管理' },
  { path: '/usage-stats', icon: BarChart3, label: '用量统计' },
]

const bottomItems = [{ path: '/settings', icon: Settings, label: '系统设置' }]

function sidebarNavClassNames(isActive: boolean, collapsed: boolean) {
  return cn(
    'relative flex min-h-11 items-center gap-3 rounded-lg px-3.5 py-3 text-sm font-medium outline-none transition-[transform,opacity,background-color,color,box-shadow] duration-200 ease-out [-webkit-tap-highlight-color:transparent] motion-reduce:transition-none',
    'hover:scale-[1.01] active:scale-[0.99] motion-reduce:hover:scale-100 motion-reduce:active:scale-100',
    'focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-offset-2 focus-visible:ring-offset-transparent',
    isActive
      ? cn(
          'text-workspace-sidebar-active-text',
          'bg-gradient-to-r from-cyan-400/25 via-violet-400/16 to-transparent shadow-[inset_0_1px_0_rgba(255,255,255,0.65),0_12px_30px_-18px_rgba(56,189,248,0.28)] ring-1 ring-workspace-sidebar-border/55',
          'dark:from-cyan-500/14 dark:via-violet-500/10 dark:to-transparent dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_12px_32px_-16px_rgba(56,189,248,0.2)] dark:ring-white/10',
          'before:absolute before:left-0 before:top-1/2 before:h-7 before:w-[3px] before:-translate-y-1/2 before:rounded-full before:bg-[hsl(var(--workspace-sidebar-active-border))] before:shadow-[0_0_14px_hsl(var(--workspace-sidebar-active-border)_/_0.45)] before:content-[\'\']',
        )
      : cn(
          'text-workspace-sidebar-text/90 hover:bg-workspace-panel-muted/85 hover:text-workspace-sidebar-text',
          'dark:text-workspace-sidebar-text/88 dark:hover:bg-white/[0.06] dark:hover:text-workspace-sidebar-text',
        ),
    collapsed && 'justify-center px-2',
  )
}

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <aside
      className={cn(
        'relative z-10 flex flex-col overflow-hidden border-r border-workspace-sidebar-border/80 bg-workspace-sidebar-bg/92 text-workspace-sidebar-text shadow-[10px_0_48px_-28px_rgba(59,130,246,0.22)] backdrop-blur-2xl transition-all duration-300',
        'dark:border-white/[0.08] dark:bg-workspace-sidebar-bg/88 dark:shadow-[10px_0_52px_-22px_rgba(0,0,0,0.65)]',
        collapsed ? 'w-16' : 'w-60',
      )}
    >
      <div className="pointer-events-none absolute -left-20 top-0 h-52 w-52 rounded-full bg-cyan-400/14 blur-3xl dark:bg-cyan-400/10" />
      <div className="pointer-events-none absolute -bottom-24 right-0 h-56 w-56 rounded-full bg-violet-400/14 blur-3xl dark:bg-violet-500/10" />

      <div className="relative flex h-16 items-center gap-3 px-4 py-5">
        <FriendlyBrandIcon size="sm" />
        {!collapsed && (
          <div className="min-w-0">
            <span className="block truncate text-base font-bold leading-tight text-workspace-sidebar-text">
              AI 用例平台
            </span>
            <span className="block truncate text-[10px] font-semibold uppercase tracking-[0.22em] text-sky-700 dark:text-cyan-200/90">
              Friendly workspace
            </span>
          </div>
        )}
      </div>

      <div className="mx-auto h-px w-[88%] shrink-0 bg-gradient-to-r from-transparent via-workspace-sidebar-border/50 to-transparent" />

      <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto px-2 py-4">
        {navItems.map((item) => {
          const NavIcon = item.icon
          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) => sidebarNavClassNames(isActive, collapsed)}
              title={collapsed ? item.label : undefined}
            >
              <NavIcon className="h-5 w-5 shrink-0 text-current" strokeWidth={2} />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </NavLink>
          )
        })}
      </nav>

      <div className="mx-auto h-px w-[88%] shrink-0 bg-gradient-to-r from-transparent via-workspace-sidebar-border/50 to-transparent" />

      <div className="shrink-0 space-y-1 px-2 pb-4 pt-2">
        {bottomItems.map((item) => {
          const NavIcon = item.icon
          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) => sidebarNavClassNames(isActive, collapsed)}
              title={collapsed ? item.label : undefined}
            >
              <NavIcon className="h-5 w-5 shrink-0 text-current" strokeWidth={2} />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </NavLink>
          )
        })}
      </div>

      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-expanded={!collapsed}
        aria-label={collapsed ? '展开侧边栏' : '收起侧边栏'}
        onClick={() => setCollapsed(!collapsed)}
        className={cn(
          'absolute -right-[17px] top-[4.5rem] z-10 h-11 w-11 rounded-full',
          'border border-workspace-sidebar-border/60 bg-workspace-sidebar-bg/95 text-workspace-sidebar-text shadow-md backdrop-blur-sm',
          'transition-[transform,opacity,background-color] duration-200 ease-out hover:scale-105 hover:bg-workspace-panel-muted/90 active:scale-95',
          'dark:border-white/10 dark:bg-workspace-topbar-control-bg/95 dark:hover:bg-white/10',
          'motion-reduce:transition-none motion-reduce:hover:scale-100 motion-reduce:active:scale-100',
          'focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-offset-2 focus-visible:ring-offset-transparent',
        )}
      >
        {collapsed ? <ChevronRight className="size-4" /> : <ChevronLeft className="size-4" />}
      </Button>
    </aside>
  )
}
