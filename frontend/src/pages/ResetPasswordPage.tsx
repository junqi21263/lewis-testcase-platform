import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { Eye, EyeOff, Loader2, Lock } from 'lucide-react'
import { authApi } from '@/api/auth'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { passwordPolicyMessage } from '@/utils/passwordPolicy'
import { getApiErrorMessage } from '@/utils/apiErrorMessage'

interface ResetPasswordForm {
  newPassword: string
}

export default function ResetPasswordPage() {
  const navigate = useNavigate()
  const { token } = useParams()
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetPasswordForm>()

  const onSubmit = async (data: ResetPasswordForm) => {
    setLoading(true)
    try {
      await authApi.resetPassword({
        token: token || '',
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
    <Card className="shadow-xl border-0 bg-white/80 dark:bg-gray-900/80 backdrop-blur">
      <CardHeader className="space-y-1 pb-4">
        <CardTitle className="text-2xl font-bold text-center">重置密码</CardTitle>
        <CardDescription className="text-center">
          设置您的新密码
        </CardDescription>
      </CardHeader>

      <form onSubmit={handleSubmit(onSubmit)}>
        <CardContent className="space-y-4">
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