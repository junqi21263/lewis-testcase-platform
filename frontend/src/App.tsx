import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { lazy, Suspense, useEffect } from 'react'
import { useAuthStore } from '@/store/authStore'
import { useThemeStore } from '@/store/themeStore'
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
const UploadPage = lazy(() => import('@/pages/UploadPage'))
const AiAnalysisPage = lazy(() => import('@/pages/AiAnalysisPage'))

function RouteFallback() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground">
      加载中…
    </div>
  )
}

/** 路由守卫：未登录跳转登录页 */
function PrivateRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />
}

export default function App() {
  const { theme } = useThemeStore()

  useEffect(() => {
    const root = window.document.documentElement
    root.classList.remove('light', 'dark')
    root.classList.add(theme)
  }, [theme])

  return (
    <BrowserRouter>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route element={<AuthLayout />}>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<Navigate to="/login" replace />} />
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
            <Route path="/upload" element={<UploadPage />} />
            <Route path="/ai-analysis" element={<AiAnalysisPage />} />
            <Route path="/generate" element={<GeneratePage />} />
            <Route path="/records" element={<RecordsPage />} />
            <Route path="/records/:id" element={<RecordDetailPage />} />
            <Route path="/templates" element={<TemplatesPage />} />
            <Route path="/teams" element={<TeamsPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>

          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
