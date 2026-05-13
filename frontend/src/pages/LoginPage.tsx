import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { useForm } from 'react-hook-form'
import { Eye, EyeOff, Loader2 } from 'lucide-react'
import { authApi } from '@/api/auth'
import { useAuthStore } from '@/store/authStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/utils/cn'

const USERNAME_RE = /^[a-zA-Z0-9_\u4e00-\u9fa5.-]+$/
/** 简单邮箱格式（与后端 LoginDto 的邮箱分支一致） */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function isValidLoginId(value: string): boolean {
  const v = value.trim()
  if (!v) return false
  if (v.includes('@')) return EMAIL_RE.test(v)
  return USERNAME_RE.test(v)
}

interface LoginForm {
  username: string
  password: string
}

export default function LoginPage() {
  const navigate = useNavigate()
  const setAuth = useAuthStore((s) => s.setAuth)
  const authError = useAuthStore((s) => s.error)
  const setError = useAuthStore((s) => s.setError)
  const loading = useAuthStore((s) => s.loading)
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginForm>()

  const onSubmit = async (data: LoginForm) => {
    setError(null)
    try {
      const result = await authApi.login(data)
      setAuth(result.user, result.accessToken, rememberMe)
      toast.success('登录成功')
      navigate('/dashboard')
    } catch {
      /* 错误已由 axios 拦截器与 authApi setError 处理 */
    }
  }

  return (
    <Card className="w-full max-w-[min(100%,28rem)] border-0 shadow-xl shadow-black/10 ring-1 ring-black/[0.04] dark:shadow-black/40 dark:ring-white/[0.06]">
      <CardHeader className="space-y-2 pb-2 text-center sm:text-left">
        <CardTitle className="text-center text-xl font-bold tracking-tight sm:text-2xl">欢迎回来</CardTitle>
        <CardDescription className="text-center text-[13px] sm:text-sm">
          当前已关闭注册与找回密码，请使用管理员账号登录
        </CardDescription>
      </CardHeader>

      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <CardContent className="space-y-4 sm:space-y-5">
          {authError && (
            <div
              role="alert"
              className="rounded-lg border border-destructive/25 bg-destructive/10 px-4 py-3 text-destructive transition-colors dark:bg-destructive/15"
            >
              <p className="text-sm font-medium leading-relaxed">{authError}</p>
            </div>
          )}

          <div className="space-y-1.5">
            <label
              htmlFor="login-username"
              className="text-sm font-medium leading-none text-foreground peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
            >
              用户名或邮箱
            </label>
            <Input
              id="login-username"
              type="text"
              autoComplete="username"
              placeholder="请输入用户名或邮箱"
              {...register('username', {
                required: '请输入用户名或邮箱',
                minLength: { value: 2, message: '至少2个字符' },
                maxLength: { value: 255, message: '过长' },
                validate: (v) =>
                  isValidLoginId(v) ||
                  (v.includes('@')
                    ? '邮箱格式不正确'
                    : '用户名仅支持字母、数字、下划线、中文、点与短横线'),
              })}
              className={errors.username ? 'ring-2 ring-destructive/60 focus-visible:ring-destructive' : ''}
              aria-invalid={errors.username ? true : undefined}
              aria-describedby={errors.username ? 'login-username-error' : undefined}
            />
            {errors.username && (
              <p id="login-username-error" className="text-xs font-medium text-destructive">
                {errors.username.message}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="login-password"
              className="text-sm font-medium leading-none text-foreground peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
            >
              密码
            </label>
            <div className="relative">
              <Input
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="请输入密码"
                {...register('password', {
                  required: '请输入密码',
                  minLength: { value: 6, message: '密码至少6位' },
                })}
                className={`pr-11 ${errors.password ? 'ring-2 ring-destructive/60 focus-visible:ring-destructive' : ''}`}
                aria-invalid={errors.password ? true : undefined}
                aria-describedby={errors.password ? 'login-password-error' : undefined}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className={cn(
                  'absolute right-2 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-md',
                  'text-muted-foreground transition-all duration-200',
                  'hover:bg-accent hover:text-foreground',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                  'active:scale-95 active:bg-accent/80 motion-reduce:active:scale-100',
                  'disabled:pointer-events-none disabled:opacity-50',
                )}
                aria-label={showPassword ? '隐藏密码' : '显示密码'}
              >
                {showPassword ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
              </button>
            </div>
            {errors.password && (
              <p id="login-password-error" className="text-xs font-medium text-destructive">
                {errors.password.message}
              </p>
            )}
          </div>
        </CardContent>

        <CardFooter className="flex flex-col gap-3 pt-1 sm:gap-4">
          <div className="flex w-full items-center justify-between gap-3">
            <label className="group flex cursor-pointer select-none items-center gap-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="h-4 w-4 shrink-0 cursor-pointer rounded border-border text-primary accent-primary transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50"
              />
              <span className="leading-none">记住我</span>
            </label>
          </div>
          <Button
            type="submit"
            variant="default"
            className="w-full min-h-11 sm:min-h-10"
            disabled={loading}
            aria-busy={loading}
          >
            {loading && <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />}
            {loading ? '登录中...' : '登录'}
          </Button>
        </CardFooter>
      </form>
    </Card>
  )
}
