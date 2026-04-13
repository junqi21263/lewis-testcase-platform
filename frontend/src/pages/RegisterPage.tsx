import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import { useForm } from 'react-hook-form'
import { Eye, EyeOff, Loader2, User, Mail, Lock } from 'lucide-react'
import { authApi } from '@/api/auth'
import { useAuthStore } from '@/store/authStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { PasswordStrength } from '@/components/PasswordStrength'

interface RegisterForm {
  email: string
  username: string
  password: string
  agreeTerms: boolean
}

export default function RegisterPage() {
  const navigate = useNavigate()
  const authError = useAuthStore((s) => s.error)
  const setError = useAuthStore((s) => s.setError)
  const setAuth = useAuthStore((s) => s.setAuth)
  const loading = useAuthStore((s) => s.loading)
  const [showPassword, setShowPassword] = useState(false)
  const [agreeTerms, setAgreeTerms] = useState(false)

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<RegisterForm>()

  const passwordValue = watch('password', '')

  const onSubmit = async (data: RegisterForm) => {
    setError(null)
    try {
      const { email, username, password } = data
      const result = await authApi.register({ email, username, password })
      setAuth(result.user, result.accessToken, false)
      toast.success('注册成功')
      navigate('/dashboard')
    } catch {
      /* 错误已由 axios 拦截器与 authApi setError 处理 */
    }
  }

  return (
    <Card className="shadow-xl border-0 bg-white/80 dark:bg-gray-900/80 backdrop-blur">
      <CardHeader className="space-y-1 pb-4">
        <CardTitle className="text-2xl font-bold text-center">创建新账号</CardTitle>
        <CardDescription className="text-center">
          注册新账号开始使用 AI 测试用例生成平台
        </CardDescription>
      </CardHeader>

      <form onSubmit={handleSubmit(onSubmit)}>
        <CardContent className="space-y-4">
          {/* 错误显示 */}
          {authError && (
            <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-md">
              <p className="text-sm">{authError}</p>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground flex items-center gap-2">
              <Mail className="w-4 h-4" />
              邮箱
            </label>
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
            <label className="text-sm font-medium text-foreground flex items-center gap-2">
              <User className="w-4 h-4" />
              用户名
            </label>
            <Input
              type="text"
              placeholder="请输入用户名"
              {...register('username', {
                required: '请输入用户名',
                minLength: { value: 2, message: '用户名至少2个字符' },
                maxLength: { value: 50, message: '用户名最多50个字符' },
              })}
              className={errors.username ? 'border-destructive' : ''}
            />
            {errors.username && (
              <p className="text-xs text-destructive">{errors.username.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground flex items-center gap-2">
              <Lock className="w-4 h-4" />
              密码
            </label>
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
            <PasswordStrength password={passwordValue} />
          </div>
        </CardContent>

        <CardFooter className="flex flex-col gap-3 pt-2">
          <div className="flex items-start gap-2">
            <input
              type="checkbox"
              checked={agreeTerms}
              onChange={(e) => setAgreeTerms(e.target.checked)}
              className="mt-1 rounded border-gray-300"
            />
            <label className="text-sm text-muted-foreground">
              我同意 <a href="#" className="text-primary hover:underline">服务条款</a> 和{' '}
              <a href="#" className="text-primary hover:underline">隐私政策</a>
            </label>
          </div>
          <Button type="submit" className="w-full" disabled={loading || !agreeTerms}>
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {loading ? '注册中...' : '注册'}
          </Button>
          <p className="text-sm text-center text-muted-foreground">
            已有账号？{' '}
            <Link to="/login" className="text-primary hover:underline font-medium">
              立即登录
            </Link>
          </p>
        </CardFooter>
      </form>
    </Card>
  )
}