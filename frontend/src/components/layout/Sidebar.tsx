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
  Bot,
  FileUp,
} from 'lucide-react'
import { cn } from '@/utils/cn'
import { useState } from 'react'
import { Button } from '@/components/ui/button'

const navItems = [
  { path: '/dashboard', icon: LayoutDashboard, label: '工作台' },
  { path: '/upload', icon: FileUp, label: '文档解析' },
  { path: '/generate', icon: Wand2, label: '生成用例' },
  { path: '/records', icon: ClipboardList, label: '生成记录' },
  { path: '/templates', icon: BookTemplate, label: '模板管理' },
  { path: '/teams', icon: Users, label: '团队管理' },
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
      ? 'bg-sidebar-accent/92 text-sidebar-foreground'
      : 'text-sidebar-foreground/75 hover:bg-sidebar-accent/55 hover:text-sidebar-accent-foreground',
    collapsed && 'justify-center px-2',
  )
}

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <aside
      className={cn(
        'relative z-10 flex flex-col bg-[color:var(--glass-bg)] text-sidebar-foreground shadow-[10px_0_40px_-34px_rgba(0,0,0,0.75)] ring-1 ring-inset ring-[color:var(--glass-border)] backdrop-blur-[var(--glass-blur)] transition-all duration-300',
        collapsed ? 'w-16' : 'w-60',
      )}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 py-5 h-16">
        <div className="flex-shrink-0 w-8 h-8 bg-sidebar-primary rounded-lg flex items-center justify-center">
          <Bot className="w-5 h-5 text-white" />
        </div>
        {!collapsed && (
          <span className="font-bold text-base leading-tight text-sidebar-foreground whitespace-nowrap overflow-hidden">
            AI 用例平台
          </span>
        )}
      </div>

      <div className="h-px w-[88%] mx-auto shrink-0 bg-gradient-to-r from-transparent via-sidebar-foreground/14 to-transparent" />

      {/* 主导航 */}
      <nav className="flex-1 px-2 py-4 space-y-1 overflow-y-auto min-h-0">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) => sidebarNavClassNames(isActive, collapsed)}
            title={collapsed ? item.label : undefined}
          >
            <item.icon className="w-5 h-5 flex-shrink-0" />
            {!collapsed && <span className="truncate">{item.label}</span>}
          </NavLink>
        ))}
      </nav>

      <div className="h-px w-[88%] mx-auto shrink-0 bg-gradient-to-r from-transparent via-sidebar-foreground/14 to-transparent" />

      {/* 底部导航 */}
      <div className="shrink-0 px-2 pb-4 pt-2 space-y-1">
        {bottomItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) => sidebarNavClassNames(isActive, collapsed)}
            title={collapsed ? item.label : undefined}
          >
            <item.icon className="w-5 h-5 flex-shrink-0" />
            {!collapsed && <span className="truncate">{item.label}</span>}
          </NavLink>
        ))}
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
          'bg-[color:var(--glass-bg)] text-sidebar-foreground shadow-[0_18px_50px_-34px_rgba(0,0,0,0.8)] ring-1 ring-inset ring-[color:var(--glass-border)] backdrop-blur-[var(--glass-blur)]',
          'transition-[transform,background-color,box-shadow] duration-200 ease-out',
          'hover:bg-[color:color-mix(in_srgb,var(--glass-bg),white_6%)] hover:scale-105 active:scale-95',
          'motion-reduce:transition-none motion-reduce:hover:scale-100 motion-reduce:active:scale-100',
          'focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-offset-2 focus-visible:ring-offset-transparent',
        )}
      >
        {collapsed ? <ChevronRight className="size-4" /> : <ChevronLeft className="size-4" />}
      </Button>
    </aside>
  )
}
