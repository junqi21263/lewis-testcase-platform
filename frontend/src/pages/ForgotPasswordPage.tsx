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
      await authApi.forgotPassword(data.email)
      toast.success('密码重置链接已发送到您的邮箱')
      navigate('/login')
    } catch (error: any) {
      toast.error(error.response?.data?.message || '发送重置链接失败，请重试')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="shadow-xl border-0 bg-white/80 dark:bg-gray-900/80 backdrop-blur">
      <CardHeader className="space-y-1 pb-4">
        <CardTitle className="text-2xl font-bold text-center">忘记密码</CardTitle>
        <CardDescription className="text-center">
          输入您的邮箱地址，我们将发送重置链接
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
            {loading ? '发送中...' : '发送重置链接'}
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