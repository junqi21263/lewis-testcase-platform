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

const USERNAME_RE = /^[a-zA-Z0-9_\u4e00-\u9fa5.-]+$/

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
    <Card className="shadow-xl border-0 bg-white/80 dark:bg-gray-900/80 backdrop-blur">
      <CardHeader className="space-y-1 pb-4">
        <CardTitle className="text-2xl font-bold text-center">欢迎回来</CardTitle>
        <CardDescription className="text-center">
          当前已关闭注册与找回密码，请使用管理员账号登录
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
            <label className="text-sm font-medium text-foreground">用户名</label>
            <Input
              type="text"
              autoComplete="username"
              placeholder="请输入用户名"
              {...register('username', {
                required: '请输入用户名',
                minLength: { value: 2, message: '用户名至少2个字符' },
                maxLength: { value: 50, message: '用户名最多50个字符' },
                pattern: {
                  value: USERNAME_RE,
                  message: '用户名仅支持字母、数字、下划线、中文、点与短横线',
                },
              })}
              className={errors.username ? 'border-destructive' : ''}
            />
            {errors.username && (
              <p className="text-xs text-destructive">{errors.username.message}</p>
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
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="rounded border-gray-300"
                />
                记住我
              </label>
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {loading ? '登录中...' : '登录'}
            </Button>
          </CardFooter>
      </form>
    </Card>
  )
}
