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
    <div className="flex h-screen overflow-hidden bg-background">
      <WallpaperLayer />
      {/* 侧边栏 */}
      <Sidebar />

      {/* 主内容区 */}
      <div className="relative z-10 flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* 顶部导航 */}
        <Header />

        {/* 页面内容 */}
        <main className="relative flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
