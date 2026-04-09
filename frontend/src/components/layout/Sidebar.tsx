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
import { Separator } from '@/components/ui/separator'
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

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <aside
      className={cn(
        'relative flex flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border transition-all duration-300',
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

      <Separator className="bg-sidebar-border" />

      {/* 主导航 */}
      <nav className="flex-1 px-2 py-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors',
                isActive
                  ? 'bg-sidebar-primary text-sidebar-primary-foreground'
                  : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                collapsed && 'justify-center px-2',
              )
            }
            title={collapsed ? item.label : undefined}
          >
            <item.icon className="w-5 h-5 flex-shrink-0" />
            {!collapsed && <span className="truncate">{item.label}</span>}
          </NavLink>
        ))}
      </nav>

      <Separator className="bg-sidebar-border" />

      {/* 底部导航 */}
      <div className="px-2 py-3 space-y-1">
        {bottomItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors',
                isActive
                  ? 'bg-sidebar-primary text-sidebar-primary-foreground'
                  : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                collapsed && 'justify-center px-2',
              )
            }
            title={collapsed ? item.label : undefined}
          >
            <item.icon className="w-5 h-5 flex-shrink-0" />
            {!collapsed && <span className="truncate">{item.label}</span>}
          </NavLink>
        ))}
      </div>

      {/* 折叠按钮 */}
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setCollapsed(!collapsed)}
        className={cn(
          'absolute -right-3.5 top-20 w-7 h-7 rounded-full bg-sidebar-border text-sidebar-foreground hover:bg-sidebar-accent border border-sidebar-border shadow-sm z-10',
        )}
      >
        {collapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
      </Button>
    </aside>
  )
}
