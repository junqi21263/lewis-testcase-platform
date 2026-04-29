import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { Eye, EyeOff, Loader2, Lock, KeyRound, Mail } from 'lucide-react'
import { authApi } from '@/api/auth'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { passwordPolicyMessage } from '@/utils/passwordPolicy'
import { getApiErrorMessage } from '@/utils/apiErrorMessage'

interface ResetPasswordForm {
  email: string
  code: string
  newPassword: string
}

export default function ResetPasswordPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const initialEmail = (searchParams.get('email') ?? '').trim().toLowerCase()

  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetPasswordForm>({
    defaultValues: { email: initialEmail },
  })

  const onSubmit = async (data: ResetPasswordForm) => {
    setLoading(true)
    try {
      await authApi.resetPassword({
        email: data.email.trim().toLowerCase(),
        code: data.code.replace(/\s/g, ''),
        newPassword: data.newPassword,
      })
      toast.success('密码重置成功！请使用新密码登录')
      navigate('/login')
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, '密码重置失败，请重试'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="shadow-[0_30px_80px_-48px_rgba(0,0,0,0.75)]">
      <CardHeader className="space-y-1 pb-4">
        <CardTitle className="text-[22px] font-semibold tracking-tight text-center">重置密码</CardTitle>
        <CardDescription className="text-center">
          填写邮箱、验证码与新密码
        </CardDescription>
      </CardHeader>

      <form onSubmit={handleSubmit(onSubmit)}>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground flex items-center gap-2">
              <Mail className="w-4 h-4" />
              邮箱
            </label>
            <Input
              type="email"
              placeholder="注册邮箱"
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
              <KeyRound className="w-4 h-4" />
              验证码
            </label>
            <Input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="6 位数字"
              maxLength={8}
              {...register('code', {
                required: '请输入验证码',
                pattern: { value: /^\d{6}$/, message: '请输入 6 位数字验证码' },
              })}
              className={errors.code ? 'border-destructive' : ''}
            />
            {errors.code && (
              <p className="text-xs text-destructive">{errors.code.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground flex items-center gap-2">
              <Lock className="w-4 h-4" />
              新密码
            </label>
            <div className="relative">
              <Input
                type={showPassword ? 'text' : 'password'}
                placeholder="请输入新密码"
                {...register('newPassword', {
                  required: '请输入新密码',
                  validate: (v) => passwordPolicyMessage(v),
                })}
                className={`pr-10 ${errors.newPassword ? 'border-destructive' : ''}`}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {errors.newPassword && (
              <p className="text-xs text-destructive">{errors.newPassword.message}</p>
            )}
          </div>
        </CardContent>

        <CardFooter className="flex flex-col gap-3 pt-2">
          <Button type="submit" className="w-full" disabled={loading}>
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {loading ? '重置中...' : '重置密码'}
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
