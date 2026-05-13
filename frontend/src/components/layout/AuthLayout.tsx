import { Outlet } from 'react-router-dom'

/** 认证页外壳：全屏交给子页（如 LoginPage）自行铺视觉与品牌，避免重复居中容器 */
export default function AuthLayout() {
  return (
    <div className="relative min-h-[100dvh] min-h-screen w-full overflow-x-hidden bg-background">
      <Outlet />
    </div>
  )
}
