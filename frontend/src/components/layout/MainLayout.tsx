import { Outlet } from 'react-router-dom'
import { useEffect } from 'react'
import Sidebar from './Sidebar'
import Header from './Header'
import { WallpaperLayer } from '@/components/wallpaper/WallpaperLayer'
import { settingsApi } from '@/api/settings'
import { usageApi } from '@/api/usage'
import toast from 'react-hot-toast'

/** 主布局：侧边栏 + 顶部导航 + 内容区 */
export default function MainLayout() {
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [cfg, summary] = await Promise.all([
          settingsApi.getMultimodalConfig().catch(() => null),
          usageApi.getSummary().catch(() => null),
        ])
        if (!cfg || !summary || cancelled) return
        if (summary.month.costCny >= cfg.monthlyCostAlertCny) {
          toast.error(
            `多模态月度费用已达 ¥${summary.month.costCny.toFixed(2)}，阈值 ¥${cfg.monthlyCostAlertCny.toFixed(2)}`,
            { id: 'multimodal-budget-warning' },
          )
        }
      } catch {
        // ignore
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="flex h-screen overflow-hidden bg-workspace-page">
      <WallpaperLayer />
      {/* 侧边栏 */}
      <Sidebar />

      {/* 主内容区 */}
      <div className="relative z-10 flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* 顶部导航 */}
        <Header />

        {/* 页面内容：workspace 宽度与轻量铺底，与登录页 playful 系统一致 */}
        <main className="relative flex-1 overflow-y-auto bg-workspace-page/95 bg-gradient-to-b from-cyan-500/[0.045] via-transparent to-violet-500/[0.055] px-5 py-6 sm:px-7 sm:py-7 lg:px-8 dark:from-slate-950/55 dark:via-slate-950/15 dark:to-indigo-950/40">
          <div className="mx-auto w-full max-w-[1520px] min-w-0">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
