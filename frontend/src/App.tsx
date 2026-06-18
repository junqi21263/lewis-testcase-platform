import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { lazy, Suspense, useEffect, useLayoutEffect, useState } from 'react'
import { useAuthStore } from '@/store/authStore'
import { useThemeStore } from '@/store/themeStore'
import { AppConfirmHost } from '@/components/ui/AppConfirmHost'
import MainLayout from '@/components/layout/MainLayout'
import AuthLayout from '@/components/layout/AuthLayout'
import LoginPage from '@/pages/LoginPage'

const DashboardPage = lazy(() => import('@/pages/DashboardPage'))
const GeneratePage = lazy(() => import('@/pages/GeneratePage'))
const RecordsPage = lazy(() => import('@/pages/RecordsPage'))
const RecordDetailPage = lazy(() => import('@/pages/RecordDetailPage'))
const RecordSharePublicPage = lazy(() => import('@/pages/RecordSharePublicPage'))
const TemplatesPage = lazy(() => import('@/pages/TemplatesPage'))
const TeamsPage = lazy(() => import('@/pages/TeamsPage'))
const ProfilePage = lazy(() => import('@/pages/ProfilePage'))
const SettingsPage = lazy(() => import('@/pages/SettingsPage'))
const AiAnalysisPage = lazy(() => import('@/pages/AiAnalysisPage'))
const UsageStatsPage = lazy(() => import('@/pages/UsageStatsPage'))
const ReviewCenterPage = lazy(() => import('@/pages/ReviewCenterPage'))
const ReviewsIndexPage = lazy(() => import('@/pages/ReviewsIndexPage'))

function RouteFallback() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground">
      加载中…
    </div>
  )
}

/** 路由守卫：persist 从 localStorage 恢复完成后再判断，避免首帧误判未登录而一直停在 /login */
function PrivateRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const [authReady, setAuthReady] = useState(() => useAuthStore.persist.hasHydrated())

  useEffect(() => {
    if (useAuthStore.persist.hasHydrated()) {
      setAuthReady(true)
      return
    }
    const unsub = useAuthStore.persist.onFinishHydration(() => setAuthReady(true))
    return unsub
  }, [])

  if (!authReady) {
    return <RouteFallback />
  }
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />
}

export default function App() {
  const theme = useThemeStore((s) => s.theme)

  useLayoutEffect(() => {
    const root = document.documentElement
    root.classList.remove('light', 'dark')
    root.classList.add(theme)
  }, [theme])

  useEffect(() => {
    if (useThemeStore.persist.hasHydrated()) return
    return useThemeStore.persist.onFinishHydration(() => {
      const t = useThemeStore.getState().theme
      const root = document.documentElement
      root.classList.remove('light', 'dark')
      root.classList.add(t)
    })
  }, [])

  return (
    <BrowserRouter>
      <AppConfirmHost />
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route element={<AuthLayout />}>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<LoginPage />} />
            <Route path="/verify-email" element={<Navigate to="/login" replace />} />
            <Route path="/forgot-password" element={<Navigate to="/login" replace />} />
            <Route path="/reset-password" element={<Navigate to="/login" replace />} />
          </Route>

          <Route path="/records/public/shares/:token" element={<RecordSharePublicPage />} />

          <Route
            element={
              <PrivateRoute>
                <MainLayout />
              </PrivateRoute>
            }
          >
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/upload" element={<Navigate to="/ai-analysis" replace />} />
            <Route path="/ai-analysis" element={<AiAnalysisPage />} />
            <Route path="/generate" element={<GeneratePage />} />
            <Route path="/records" element={<RecordsPage />} />
            <Route path="/records/:id" element={<RecordDetailPage />} />
            <Route path="/reviews" element={<ReviewsIndexPage />} />
            <Route path="/reviews/:recordId" element={<ReviewCenterPage />} />
            <Route path="/templates" element={<TemplatesPage />} />
            <Route path="/teams" element={<TeamsPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/usage-stats" element={<UsageStatsPage />} />
          </Route>

          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
