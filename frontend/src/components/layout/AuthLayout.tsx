import { Outlet } from 'react-router-dom'
import { Bot } from 'lucide-react'

/** 认证页面布局（登录/注册） */
export default function AuthLayout() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950 flex items-center justify-center p-4">
      {/* 背景装饰 */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-blue-100 dark:bg-blue-900/20 rounded-full blur-3xl opacity-50" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-indigo-100 dark:bg-indigo-900/20 rounded-full blur-3xl opacity-50" />
      </div>

      <div className="relative w-full max-w-md">
        {/* 品牌 Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center shadow-lg">
              <Bot className="w-6 h-6 text-white" />
            </div>
            <span className="text-2xl font-bold text-foreground">AI 用例平台</span>
          </div>
          <p className="text-sm text-muted-foreground">智能测试用例生成，提升测试效率</p>
        </div>

        <Outlet />
      </div>
    </div>
  )
}
