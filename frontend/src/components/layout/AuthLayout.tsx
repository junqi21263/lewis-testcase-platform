import { Outlet } from 'react-router-dom'
import { Bot } from 'lucide-react'

/** 认证页面布局（登录/注册） */
export default function AuthLayout() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6 sm:p-8">
      {/* 背景装饰 */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full blur-3xl opacity-35 bg-[hsl(var(--primary)/0.18)]" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full blur-3xl opacity-30 bg-[hsl(var(--primary)/0.12)]" />
      </div>

      <div className="relative w-full max-w-md">
        {/* 品牌 Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center shadow-[0_18px_50px_-34px_rgba(0,122,255,0.85)]">
              <Bot className="w-6 h-6 text-white" />
            </div>
            <span className="text-[22px] font-semibold tracking-tight text-foreground">AI 用例平台</span>
          </div>
          <p className="text-[13px] leading-5 text-muted-foreground">智能测试用例生成，提升测试效率</p>
        </div>

        <Outlet />
      </div>
    </div>
  )
}
