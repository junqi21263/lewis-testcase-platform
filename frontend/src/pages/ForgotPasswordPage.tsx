import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { Mail, Loader2 } from 'lucide-react'
import { authApi } from '@/api/auth'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'

interface ForgotPasswordForm {
  email: string
}

export default function ForgotPasswordPage() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotPasswordForm>()

  const onSubmit = async (data: ForgotPasswordForm) => {
    setLoading(true)
    try {
      const email = data.email.trim().toLowerCase()
      await authApi.forgotPassword(email)
      toast.success('若该邮箱已注册，您将收到验证码（开发环境可查看服务端日志）')
      navigate(`/reset-password?email=${encodeURIComponent(email)}`, { replace: true })
    } catch (error: unknown) {
      const msg =
        error && typeof error === 'object' && 'response' in error
          ? (error as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined
      toast.error(typeof msg === 'string' ? msg : '发送验证码失败，请重试')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="shadow-[0_30px_80px_-48px_rgba(0,0,0,0.75)]">
      <CardHeader className="space-y-1 pb-4">
        <CardTitle className="text-[22px] font-semibold tracking-tight text-center">忘记密码</CardTitle>
        <CardDescription className="text-center">
          输入注册邮箱，我们将发送 6 位验证码用于重置密码
        </CardDescription>
      </CardHeader>

      <form onSubmit={handleSubmit(onSubmit)}>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground flex items-center gap-2">
              <Mail className="w-4 h-4" />
              邮箱地址
            </label>
            <Input
              type="email"
              placeholder="请输入注册邮箱"
              {...register('email', {
                required: '请输入邮箱',
                pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: '邮箱格式不正确' },
              })}
              className={errors.email ? 'border-destructive' : ''}
            />
            {errors.email && (
              <p className="text-xs text-destructive">{errors.email.message}</p>
            )}
          </div>
        </CardContent>

        <CardFooter className="flex flex-col gap-3 pt-2">
          <Button type="submit" className="w-full" disabled={loading}>
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {loading ? '发送中...' : '发送验证码'}
          </Button>
          <p className="text-sm text-center text-muted-foreground">
            记得密码？{' '}
            <a href="/login" className="text-primary hover:underline font-medium">
              立即登录
            </a>
          </p>
        </CardFooter>
      </form>
    </Card>
  )
}
