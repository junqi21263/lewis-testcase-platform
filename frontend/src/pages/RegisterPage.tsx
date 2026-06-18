import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import { useForm } from 'react-hook-form'
import { Eye, EyeOff, Loader2, Mail, Lock, KeyRound, RefreshCw, ShieldCheck } from 'lucide-react'
import { authApi } from '@/api/auth'
import { useAuthStore } from '@/store/authStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { PasswordStrength } from '@/components/PasswordStrength'
import { passwordPolicyMessage } from '@/utils/passwordPolicy'
import type { CaptchaChallenge } from '@/types'

interface RegisterForm {
  email: string
  password: string
  confirmPassword: string
  inviteCode: string
  captchaCode: string
  agreeTerms: boolean
}

interface CodeForm {
  code: string
}

export default function RegisterPage() {
  const navigate = useNavigate()
  const authError = useAuthStore((s) => s.error)
  const setError = useAuthStore((s) => s.setError)
  const setAuth = useAuthStore((s) => s.setAuth)
  const loading = useAuthStore((s) => s.loading)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [agreeTerms, setAgreeTerms] = useState(false)
  const [step, setStep] = useState<'form' | 'code'>('form')
  const [pendingEmail, setPendingEmail] = useState('')
  const [captcha, setCaptcha] = useState<CaptchaChallenge | null>(null)
  const [captchaLoading, setCaptchaLoading] = useState(false)

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<RegisterForm>()

  const {
    register: registerCode,
    handleSubmit: handleSubmitCode,
    formState: { errors: codeErrors },
  } = useForm<CodeForm>()

  const passwordValue = watch('password', '')

  const loadCaptcha = async () => {
    setCaptchaLoading(true)
    try {
      setCaptcha(await authApi.getCaptcha('register'))
    } catch {
      toast.error('图形验证码加载失败，请稍后重试')
    } finally {
      setCaptchaLoading(false)
    }
  }

  useEffect(() => {
    void loadCaptcha()
  }, [])

  const onSendCode = async (data: RegisterForm) => {
    setError(null)
    if (!captcha?.captchaId) {
      toast.error('请先刷新并填写图形验证码')
      return
    }
    try {
      const { email, password, confirmPassword, inviteCode, captchaCode } = data
      const meta = await authApi.sendRegisterCode({
        email: email.trim().toLowerCase(),
        password,
        confirmPassword,
        inviteCode,
        captchaId: captcha.captchaId,
        captchaCode,
      })
      setPendingEmail(meta.email)
      if (meta.mailConfigured === false && meta.mailIssues?.length) {
        toast.error(
          `无法发信：${meta.mailIssues.join('；')}。开发环境可在服务端日志查看验证码。`,
          { duration: 9000 },
        )
      } else {
        toast.success('验证码已发送，请查收邮箱（含垃圾箱），15 分钟内有效', { duration: 6000 })
      }
      setStep('code')
    } catch {
      /* 错误已由 axios 拦截器与 authApi setError 处理 */
      void loadCaptcha()
    }
  }

  const onConfirmCode = async (data: CodeForm) => {
    setError(null)
    try {
      const result = await authApi.confirmRegister({
        email: pendingEmail,
        code: data.code.replace(/\s/g, ''),
      })
      setAuth(result.user, result.accessToken, false)
      toast.success('注册成功')
      navigate('/dashboard', { replace: true })
    } catch {
      /* 同上 */
    }
  }

  const handleResend = async () => {
    if (!pendingEmail) return
    setError(null)
    try {
      await authApi.resendRegisterCode(pendingEmail)
      toast.success('若该邮箱有待验证注册，您将收到新的验证码', { duration: 5000 })
    } catch {
      /* 同上 */
    }
  }

  const goBackToForm = () => {
    setStep('form')
    setPendingEmail('')
    setError(null)
  }

  return (
    <Card className="shadow-[0_30px_80px_-48px_rgba(0,0,0,0.75)]">
      <CardHeader className="space-y-1 pb-4">
        <CardTitle className="text-[22px] font-semibold tracking-tight text-center">创建新账号</CardTitle>
        <CardDescription className="text-center">
          {step === 'form'
            ? '仅限邀请注册：邮箱 + 图形验证码 + 密码 + 邀请码 + 邮箱验证码'
            : `我们已向 ${pendingEmail} 发送 6 位验证码，填写后即可完成注册`}
        </CardDescription>
      </CardHeader>

      {step === 'form' ? (
        <form onSubmit={handleSubmit(onSendCode)}>
          <CardContent className="space-y-4">
            {authError && (
              <div className="rounded-lg bg-[hsl(var(--destructive)/0.12)] px-4 py-3 ring-1 ring-inset ring-[hsl(var(--destructive)/0.22)]">
                <p className="text-[13px] leading-5 text-destructive break-words">{authError}</p>
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
                <Lock className="w-4 h-4" />
                密码
              </label>
              <div className="relative">
                <Input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="请输入密码"
                  {...register('password', {
                    required: '请输入密码',
                    validate: (v) => passwordPolicyMessage(v),
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

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground flex items-center gap-2">
                <Lock className="w-4 h-4" />
                确认密码
              </label>
              <div className="relative">
                <Input
                  type={showConfirmPassword ? 'text' : 'password'}
                  placeholder="请再次输入密码"
                  {...register('confirmPassword', {
                    required: '请再次输入密码',
                    validate: (v) => v === passwordValue || '两次输入的密码不一致',
                  })}
                  className={`pr-10 ${errors.confirmPassword ? 'border-destructive' : ''}`}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label={showConfirmPassword ? '隐藏确认密码' : '显示确认密码'}
                >
                  {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {errors.confirmPassword && (
                <p className="text-xs text-destructive">{errors.confirmPassword.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground flex items-center gap-2">
                <ShieldCheck className="w-4 h-4" />
                图形验证码
              </label>
              <div className="grid grid-cols-[minmax(0,1fr)_132px] gap-2">
                <Input
                  type="text"
                  autoComplete="off"
                  placeholder="输入图中字符"
                  {...register('captchaCode', {
                    required: '请输入图形验证码',
                    minLength: { value: 4, message: '验证码至少4个字符' },
                  })}
                  className={errors.captchaCode ? 'border-destructive' : ''}
                />
                <button
                  type="button"
                  onClick={() => void loadCaptcha()}
                  disabled={captchaLoading}
                  className="flex h-10 items-center justify-center overflow-hidden rounded-md border border-input bg-background text-sm hover:bg-accent disabled:opacity-60"
                  aria-label="刷新图形验证码"
                  title="点击刷新验证码"
                >
                  {captchaLoading || !captcha ? (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  ) : (
                    <span
                      className="flex h-full w-full items-center justify-center [&>svg]:h-full [&>svg]:w-full"
                      dangerouslySetInnerHTML={{ __html: captcha.imageSvg }}
                    />
                  )}
                </button>
              </div>
              {errors.captchaCode && (
                <p className="text-xs text-destructive">{errors.captchaCode.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground flex items-center gap-2">
                <KeyRound className="w-4 h-4" />
                邀请码
              </label>
              <Input
                type="text"
                inputMode="numeric"
                autoComplete="off"
                placeholder="请输入邀请码"
                {...register('inviteCode', {
                  required: '请输入邀请码',
                  validate: (v) => v.trim() === '0628' || '邀请码不正确',
                })}
                className={errors.inviteCode ? 'border-destructive' : ''}
              />
              {errors.inviteCode && (
                <p className="text-xs text-destructive">{errors.inviteCode.message}</p>
              )}
            </div>
          </CardContent>

          <CardFooter className="flex flex-col gap-3 pt-2">
            <div className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={agreeTerms}
                onChange={(e) => setAgreeTerms(e.target.checked)}
                className="mt-1 h-4 w-4 rounded accent-[hsl(var(--primary))]"
              />
              <label className="text-sm text-muted-foreground">
                我同意 <a href="#" className="text-primary hover:underline">服务条款</a> 和{' '}
                <a href="#" className="text-primary hover:underline">隐私政策</a>
              </label>
            </div>
            <Button type="submit" className="w-full" disabled={loading || !agreeTerms}>
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {loading ? '发送中...' : '发送验证码'}
            </Button>
            <p className="text-sm text-center text-muted-foreground">
              已有账号？{' '}
              <Link to="/login" className="text-primary hover:underline font-medium">
                立即登录
              </Link>
            </p>
          </CardFooter>
        </form>
      ) : (
        <form onSubmit={handleSubmitCode(onConfirmCode)}>
          <CardContent className="space-y-4">
            {authError && (
              <div className="rounded-lg bg-[hsl(var(--destructive)/0.12)] px-4 py-3 ring-1 ring-inset ring-[hsl(var(--destructive)/0.22)]">
                <p className="text-[13px] leading-5 text-destructive break-words">{authError}</p>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground flex items-center gap-2">
                <KeyRound className="w-4 h-4" />
                邮箱验证码
              </label>
              <Input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="6 位数字"
                maxLength={8}
                {...registerCode('code', {
                  required: '请输入验证码',
                  pattern: { value: /^\d{6}$/, message: '请输入 6 位数字验证码' },
                })}
                className={codeErrors.code ? 'border-destructive' : ''}
              />
              {codeErrors.code && (
                <p className="text-xs text-destructive">{codeErrors.code.message}</p>
              )}
            </div>

            <p className="text-xs text-muted-foreground">
              若邮箱有误，可返回上一步修改（需重新获取验证码）。
            </p>
          </CardContent>

          <CardFooter className="flex flex-col gap-3 pt-2">
            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {loading ? '验证中...' : '完成注册'}
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="w-full"
              disabled={loading}
              onClick={handleResend}
            >
              重发验证码
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              disabled={loading}
              onClick={() => {
                goBackToForm()
                toast('已返回：请确认邮箱与密码后重新发送验证码')
              }}
            >
              返回修改资料
            </Button>
            <p className="text-sm text-center text-muted-foreground">
              已有账号？{' '}
              <Link to="/login" className="text-primary hover:underline font-medium">
                立即登录
              </Link>
            </p>
          </CardFooter>
        </form>
      )}
    </Card>
  )
}
