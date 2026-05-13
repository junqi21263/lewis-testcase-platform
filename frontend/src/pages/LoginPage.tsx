import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { useForm } from 'react-hook-form'
import { Eye, EyeOff, Loader2 } from 'lucide-react'
import { authApi } from '@/api/auth'
import { useAuthStore } from '@/store/authStore'
import { useThemeStore } from '@/store/themeStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/utils/cn'
import { LoginAmbientCanvas } from '@/components/auth/LoginAmbientCanvas'
import { LoginBrandIcon } from '@/components/auth/LoginBrandIcon'
import { LoginMascotStageDecor } from '@/components/auth/LoginMascotStageDecor'
import { LoginMascot, type LoginMascotMood } from '@/components/auth/LoginMascot'
import { LoginThemeToggle } from '@/components/auth/LoginThemeToggle'

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

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n))
}

export default function LoginPage() {
  const navigate = useNavigate()
  const theme = useThemeStore((s) => s.theme)
  const setAuth = useAuthStore((s) => s.setAuth)
  const authError = useAuthStore((s) => s.error)
  const setError = useAuthStore((s) => s.setError)
  const loading = useAuthStore((s) => s.loading)
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(false)
  const [userFocus, setUserFocus] = useState(false)
  const [pwdFocus, setPwdFocus] = useState(false)
  const [look, setLook] = useState({ x: 0, y: 0 })
  const [shakeId, setShakeId] = useState(0)
  const [celebrate, setCelebrate] = useState(false)
  const mascotRef = useRef<HTMLDivElement>(null)
  const prevLoading = useRef(loading)

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<LoginForm>()

  const passwordValue = watch('password') ?? ''
  const usernameValue = watch('username') ?? ''

  const usernameReg = register('username', {
    required: '请输入用户名或邮箱',
    minLength: { value: 2, message: '至少2个字符' },
    maxLength: { value: 255, message: '过长' },
    validate: (v) =>
      isValidLoginId(v) ||
      (v.includes('@') ? '邮箱格式不正确' : '用户名仅支持字母、数字、下划线、中文、点与短横线'),
  })

  const passwordReg = register('password', {
    required: '请输入密码',
    minLength: { value: 6, message: '密码至少6位' },
  })

  useEffect(() => {
    if (prevLoading.current && !loading && authError) {
      setShakeId((n) => n + 1)
    }
    prevLoading.current = loading
  }, [loading, authError])

  useEffect(() => {
    const mascot = mascotRef.current
    const usernameEl = document.getElementById('login-username')
    const passwordEl = document.getElementById('login-password')
    const onMove = (e: MouseEvent) => {
      if (!mascot) return
      const r = mascot.getBoundingClientRect()
      const cx = r.left + r.width / 2
      const cy = r.top + r.height / 2
      let nx = (e.clientX - cx) / Math.max(r.width / 2, 1)
      let ny = (e.clientY - cy) / Math.max(r.height / 2, 1)
      if (pwdFocus && passwordEl) {
        const ir = passwordEl.getBoundingClientRect()
        const ix = (ir.left + ir.right) / 2
        const iy = (ir.top + ir.bottom) / 2
        const tx = (ix - cx) / Math.max(r.width / 2, 1)
        const ty = (iy - cy) / Math.max(r.height / 2, 1)
        nx = nx * 0.3 + tx * 0.7
        ny = ny * 0.3 + ty * 0.7
      } else if (userFocus && usernameEl) {
        const ir = usernameEl.getBoundingClientRect()
        const ix = (ir.left + ir.right) / 2
        const iy = (ir.top + ir.bottom) / 2
        const tx = (ix - cx) / Math.max(r.width / 2, 1)
        const ty = (iy - cy) / Math.max(r.height / 2, 1)
        nx = nx * 0.45 + tx * 0.55
        ny = ny * 0.45 + ty * 0.55
      }
      setLook({ x: clamp(nx, -1, 1), y: clamp(ny, -1, 1) })
    }
    window.addEventListener('mousemove', onMove, { passive: true })
    return () => window.removeEventListener('mousemove', onMove)
  }, [userFocus, pwdFocus])

  const eyesMode = showPassword
    ? 'cautious'
    : pwdFocus || passwordValue.length > 0
      ? 'closed'
      : 'track'

  let mascotMood: LoginMascotMood = 'idle'
  if (celebrate) mascotMood = 'success'
  else if (loading) mascotMood = 'loading'
  else if (authError) mascotMood = 'error'
  else if (userFocus && usernameValue.trim().length > 0 && !pwdFocus) mascotMood = 'listening'

  const onSubmit = async (data: LoginForm) => {
    setError(null)
    try {
      const result = await authApi.login(data)
      setAuth(result.user, result.accessToken, rememberMe)
      toast.success('登录成功')
      setCelebrate(true)
      await new Promise((r) => setTimeout(r, 300))
      setCelebrate(false)
      navigate('/dashboard')
    } catch {
      /* 错误已由 axios 拦截器与 authApi setError 处理 */
    }
  }

  const inputBase = cn(
    'login-soft-input flex h-[52px] w-full rounded-[15px] border-0 px-4 text-[15px] !shadow-none !ring-0',
    'hover:!ring-0 focus-visible:!ring-0 focus-visible:!ring-offset-0',
    'active:scale-[0.998] motion-reduce:active:scale-100 motion-reduce:focus-visible:translate-y-0',
  )

  return (
    <div className="login-page-root relative isolate min-h-[100dvh] w-full overflow-x-hidden overflow-y-auto transition-colors duration-300 ease-out">
      <LoginThemeToggle className="fixed right-4 top-4 z-[80] sm:right-7 sm:top-7" />

      <div className="login-page-bg pointer-events-none absolute inset-0 transition-[background] duration-300 ease-out" aria-hidden />
      <div
        className="login-blob -left-[14%] top-[10%] z-0 h-[min(48vw,400px)] w-[min(48vw,400px)] motion-reduce:opacity-0"
        style={{ background: 'var(--lp-blob-a)' }}
        aria-hidden
      />
      <div
        className="login-blob right-[-8%] top-[22%] z-0 h-[min(42vw,340px)] w-[min(42vw,340px)] motion-reduce:opacity-0"
        style={{ background: 'var(--lp-blob-b)' }}
        aria-hidden
      />
      <div
        className="login-blob bottom-[5%] left-[18%] z-0 h-[min(38vw,300px)] w-[min(38vw,300px)] motion-reduce:opacity-0"
        style={{ background: 'var(--lp-blob-c)' }}
        aria-hidden
      />
      <div
        className="login-blob bottom-[20%] right-[12%] z-0 h-[min(32vw,260px)] w-[min(32vw,260px)] motion-reduce:opacity-0"
        style={{ background: 'var(--lp-blob-d)' }}
        aria-hidden
      />
      <div className="login-grain pointer-events-none absolute inset-0 z-0 transition-opacity duration-300" aria-hidden />
      <LoginAmbientCanvas theme={theme} />

      <div className="relative z-[4] mx-auto flex min-h-[100dvh] w-full max-w-[1240px] flex-col items-center justify-center px-4 pb-10 pt-16 sm:px-6 sm:pb-12 sm:pt-20 lg:px-10 lg:pb-14 lg:pt-14">
        <div className="grid w-full grid-cols-1 items-center gap-10 lg:grid-cols-[minmax(0,13fr)_minmax(0,12fr)] lg:gap-x-20 lg:gap-y-10">
          <aside className="relative z-[4] order-2 flex min-h-0 flex-col justify-center lg:order-1">
            <header className="login-enter login-enter-delay-1 relative z-20 mx-auto w-full max-w-xl px-10 pb-6 pt-2 text-center lg:mx-0 lg:text-left">
              <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-start sm:gap-6">
                <LoginBrandIcon />
                <div className="min-w-0 space-y-2.5">
                  <p
                    className="text-[11px] font-semibold uppercase tracking-[0.2em] transition-colors duration-300"
                    style={{ color: 'var(--lp-eyebrow)' }}
                  >
                    AI 用例平台
                  </p>
                  <h1
                    className="text-balance text-2xl font-semibold tracking-tight transition-colors duration-300 sm:text-3xl lg:text-[1.9rem]"
                    style={{ color: 'var(--lp-text-primary)' }}
                  >
                    让测试用例自己跑起来
                  </h1>
                  <p
                    className="mx-auto max-w-full whitespace-nowrap text-sm leading-relaxed transition-colors duration-300 sm:text-[15px] lg:mx-0"
                    style={{ color: 'var(--lp-text-secondary)' }}
                  >
                    把需求、图片、OCR 和业务规则转成可评审、可执行的测试用例。
                  </p>
                </div>
              </div>
            </header>

            <div className="relative z-10 mt-2 flex w-full justify-center lg:justify-start">
              <div className="login-mascot-stage relative flex w-full max-w-[380px] min-h-[220px] items-center justify-center sm:min-h-[260px] lg:min-h-[280px]">
                <div className="pointer-events-none absolute inset-0 hidden lg:block" aria-hidden>
                  <LoginMascotStageDecor />
                </div>
                <div ref={mascotRef} className="login-enter login-enter-delay-2 relative z-[2] flex justify-center">
                  <div key={`mascot-shake-${shakeId}`} className={cn(shakeId > 0 && 'login-mascot-head-shake-once')}>
                    <LoginMascot
                      look={look}
                      eyesMode={eyesMode}
                      mood={mascotMood}
                      passwordHiddenGlow={!showPassword && passwordValue.length > 0}
                    />
                  </div>
                </div>
              </div>
            </div>

            <footer
              className="login-enter login-enter-delay-3 relative z-20 mx-auto mt-8 hidden max-w-xl px-10 text-center text-xs leading-relaxed transition-colors duration-300 sm:block lg:mx-0 lg:text-left"
              style={{ color: 'var(--lp-footer)' }}
            >
              Friendly AI workspace：OCR、多模态与团队工作流，一站完成。
            </footer>
          </aside>

          <main className="relative z-[6] order-1 flex w-full justify-center lg:order-2">
            <div
              key={`login-card-${shakeId}`}
              className={cn(
                'login-enter login-enter-delay-2 w-full max-w-[min(100%,420px)]',
                shakeId > 0 && 'login-shake-once',
              )}
            >
              <div
                className={cn(
                  'login-panel-shell rounded-[30px] p-px transition-[box-shadow,filter] duration-300',
                  loading && 'login-card-busy-light',
                )}
              >
                <div className="login-panel-body rounded-[29px] px-6 py-8 transition-[background,box-shadow] duration-300 sm:px-8 sm:py-9">
                  <header className="login-enter login-enter-delay-3 mb-7 space-y-2">
                    <h2
                      className="text-xl font-semibold tracking-tight sm:text-[1.35rem]"
                      style={{ color: 'var(--lp-card-title)' }}
                    >
                      欢迎回来
                    </h2>
                    <p className="text-[13px] leading-relaxed sm:text-sm" style={{ color: 'var(--lp-card-muted)' }}>
                      继续管理你的 AI 测试用例与团队工作流
                    </p>
                  </header>

                  <form onSubmit={handleSubmit(onSubmit)} noValidate>
                    <div className="login-enter login-enter-delay-4 space-y-5">
                      {authError && (
                        <div role="alert" className="login-error-banner rounded-2xl px-3.5 py-2.5 shadow-sm">
                          <p className="text-sm font-medium leading-relaxed">{authError}</p>
                        </div>
                      )}

                      <div className="group/login-user space-y-2">
                        <label
                          htmlFor="login-username"
                          className="text-[13px] font-medium transition-colors duration-200 group-focus-within/login-user:text-[color:var(--lp-label-focus)]"
                          style={{ color: 'var(--lp-label)' }}
                        >
                          用户名或邮箱
                        </label>
                        <Input
                          id="login-username"
                          type="text"
                          autoComplete="username"
                          placeholder="请输入用户名或邮箱"
                          {...usernameReg}
                          onFocus={() => setUserFocus(true)}
                          onBlur={(e) => {
                            setUserFocus(false)
                            void usernameReg.onBlur(e)
                          }}
                          className={cn(inputBase, errors.username && 'login-soft-input--error')}
                          aria-invalid={errors.username ? true : undefined}
                          aria-describedby={errors.username ? 'login-username-error' : undefined}
                        />
                        {errors.username && (
                          <p id="login-username-error" className="text-xs font-medium text-red-500 dark:text-red-400">
                            {errors.username.message}
                          </p>
                        )}
                      </div>

                      <div className="group/login-pwd space-y-2">
                        <label
                          htmlFor="login-password"
                          className="text-[13px] font-medium transition-colors duration-200 group-focus-within/login-pwd:text-[color:var(--lp-label-focus)]"
                          style={{ color: 'var(--lp-label)' }}
                        >
                          密码
                        </label>
                        <div className="relative">
                          <Input
                            id="login-password"
                            type={showPassword ? 'text' : 'password'}
                            autoComplete="current-password"
                            placeholder="请输入密码"
                            {...passwordReg}
                            onFocus={() => setPwdFocus(true)}
                            onBlur={(e) => {
                              setPwdFocus(false)
                              void passwordReg.onBlur(e)
                            }}
                            className={cn(
                              inputBase,
                              'login-soft-input--password pr-12',
                              errors.password && 'login-soft-input--error',
                            )}
                            aria-invalid={errors.password ? true : undefined}
                            aria-describedby={errors.password ? 'login-password-error' : undefined}
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className={cn(
                              'login-pwd-toggle absolute right-2.5 top-1/2 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-xl transition-colors duration-200',
                              'hover:bg-[color:var(--lp-icon-btn-hover-bg)] hover:text-[color:var(--lp-icon-btn-hover)]',
                              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/35 focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--lp-checkbox-ring-offset)]',
                              'active:scale-95 motion-reduce:active:scale-100',
                            )}
                            style={{ color: 'var(--lp-icon-btn)' }}
                            aria-label={showPassword ? '隐藏密码' : '显示密码'}
                          >
                            {showPassword ? (
                              <EyeOff className="h-[1.1rem] w-[1.1rem] stroke-[1.5]" aria-hidden />
                            ) : (
                              <Eye className="h-[1.1rem] w-[1.1rem] stroke-[1.5]" aria-hidden />
                            )}
                          </button>
                        </div>
                        {errors.password && (
                          <p id="login-password-error" className="text-xs font-medium text-red-500 dark:text-red-400">
                            {errors.password.message}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="login-enter login-enter-delay-5 mt-7 flex flex-col gap-4">
                      <label
                        className="flex cursor-pointer select-none items-center gap-3 text-[13px] transition-colors duration-200"
                        style={{ color: 'var(--lp-label)' }}
                      >
                        <input
                          type="checkbox"
                          checked={rememberMe}
                          onChange={(e) => setRememberMe(e.target.checked)}
                          className="login-form-checkbox h-[18px] w-[18px] cursor-pointer rounded-md transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--lp-checkbox-ring-offset)]"
                        />
                        <span>记住我</span>
                      </label>
                      <Button
                        type="submit"
                        variant="default"
                        disabled={loading}
                        aria-busy={loading}
                        className={cn(
                          'login-btn-shine login-submit-btn relative h-[54px] w-full overflow-hidden rounded-2xl border-0 px-4 text-[15px] font-semibold text-white !ring-0',
                          'transition-[transform,box-shadow,filter] duration-200',
                          'hover:enabled:-translate-y-0.5',
                          'active:enabled:translate-y-px active:enabled:brightness-[0.97]',
                          'disabled:opacity-65 disabled:hover:translate-y-0',
                          loading && 'login-submit-btn--busy',
                        )}
                      >
                        <span className="relative z-[1] inline-flex items-center justify-center gap-2">
                          {loading && <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />}
                          {loading ? '登录中...' : '登录'}
                        </span>
                      </Button>
                    </div>
                  </form>
                </div>
              </div>
            </div>
          </main>
        </div>
      </div>
    </div>
  )
}
