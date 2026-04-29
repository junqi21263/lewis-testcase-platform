import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import Header from './Header'
import { WallpaperLayer } from '@/components/wallpaper/WallpaperLayer'

/** 主布局：侧边栏 + 顶部导航 + 内容区 */
export default function MainLayout() {
  return (
    <div className="flex h-screen overflow-hidden">
      <WallpaperLayer />
      {/* 侧边栏 */}
      <Sidebar />

      {/* 主内容区 */}
      <div className="relative z-10 flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* 顶部导航 */}
        <Header />

        {/* 页面内容 */}
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
