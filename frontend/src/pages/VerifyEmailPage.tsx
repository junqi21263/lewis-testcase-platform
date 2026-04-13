import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { Loader2, Mail } from 'lucide-react'
import { authApi } from '@/api/auth'
import { useAuthStore } from '@/store/authStore'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default function VerifyEmailPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const setAuth = useAuthStore((s) => s.setAuth)
  const loading = useAuthStore((s) => s.loading)

  const token = searchParams.get('token')?.trim() || ''
  const email = searchParams.get('email')?.trim().toLowerCase() || ''
  const pendingOnly = searchParams.get('pending') === '1'

  const [verifyAttempted, setVerifyAttempted] = useState(false)
  const [verifyError, setVerifyError] = useState<string | null>(null)

  useEffect(() => {
    if (!token || !email || pendingOnly) {
      setVerifyAttempted(true)
      return
    }

    let cancelled = false
    ;(async () => {
      setVerifyError(null)
      try {
        const result = await authApi.verifyEmail({ email, token })
        if (cancelled) return
        setAuth(result.user, result.accessToken, false)
        toast.success('邮箱验证成功')
        navigate('/dashboard', { replace: true })
      } catch {
        if (!cancelled) {
          setVerifyError('链接无效或已过期，请重新注册或请求重发验证邮件')
        }
      } finally {
        if (!cancelled) setVerifyAttempted(true)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [token, email, pendingOnly, navigate, setAuth])

  const handleResend = async () => {
    if (!email) {
      toast.error('请提供注册邮箱')
      return
    }
    try {
      await authApi.resendVerificationEmail(email)
    } catch {
      /* 错误已由拦截器处理 */
    }
  }

  const showSpinner = token && email && !pendingOnly && !verifyAttempted

  return (
    <Card className="shadow-xl border-0 bg-white/80 dark:bg-gray-900/80 backdrop-blur max-w-md w-full">
      <CardHeader className="space-y-1 text-center">
        <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
          <Mail className="h-6 w-6 text-primary" />
        </div>
        <CardTitle className="text-xl">邮箱验证</CardTitle>
        <CardDescription>
          {pendingOnly && email
            ? `我们已向 ${email} 发送验证邮件，请查收并点击邮件中的链接。`
            : token && email
              ? '正在验证你的邮箱…'
              : '请使用邮件中的完整链接打开本页，或从注册成功页进入后重发邮件。'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {showSpinner && (
          <div className="flex justify-center py-6">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        )}

        {verifyError && (
          <p className="text-sm text-destructive text-center">{verifyError}</p>
        )}

        {email && (pendingOnly || verifyError) && (
          <Button type="button" className="w-full" variant="secondary" disabled={loading} onClick={handleResend}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : '重发验证邮件'}
          </Button>
        )}

        <Button type="button" variant="outline" className="w-full" asChild>
          <Link to="/login">返回登录</Link>
        </Button>
      </CardContent>
    </Card>
  )
}
