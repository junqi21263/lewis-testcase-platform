import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { Eye, EyeOff, Loader2 } from 'lucide-react'
import { authApi } from '@/api/auth'
import { useAuthStore } from '@/store/authStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import toast from 'react-hot-toast'

interface LoginForm {
  email: string
  password: string
}

export default function LoginPage() {
  const navigate = useNavigate()
  const setAuth = useAuthStore((s) => s.setAuth)
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginForm>()

  const onSubmit = async (data: LoginForm) => {
    setLoading(true)
    try {
      const result = await authApi.login(data)
      setAuth(result.user, result.accessToken)
      toast.success('登录成功，欢迎回来！')
      navigate('/dashboard')
    } catch {
      // 错误已在拦截器中处理
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="shadow-xl border-0 bg-white/80 dark:bg-gray-900/80 backdrop-blur">
      <CardHeader className="space-y-1 pb-4">
        <CardTitle className="text-2xl font-bold text-center">欢迎回来</CardTitle>
        <CardDescription className="text-center">
          登录您的账号以继续使用平台
        </CardDescription>
      </CardHeader>

      <form onSubmit={handleSubmit(onSubmit)}>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">邮箱</label>
            <Input
              type="email"
              placeholder="请输入邮箱地址"
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

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">密码</label>
            <div className="relative">
              <Input
                type={showPassword ? 'text' : 'password'}
                placeholder="请输入密码"
                {...register('password', {
                  required: '请输入密码',
                  minLength: { value: 6, message: '密码至少6位' },
                })}
                className={`pr-10 ${errors.password ? 'border-destructive' : ''}`}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {errors.password && (
              <p className="text-xs text-destructive">{errors.password.message}</p>
            )}
          </div>
        </CardContent>

        <CardFooter className="flex flex-col gap-3 pt-2">
          <Button type="submit" className="w-full" disabled={loading}>
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {loading ? '登录中...' : '登录'}
          </Button>
          <p className="text-sm text-center text-muted-foreground">
            还没有账号？{' '}
            <Link to="/register" className="text-primary hover:underline font-medium">
              立即注册
            </Link>
          </p>
        </CardFooter>
      </form>
    </Card>
  )
}
