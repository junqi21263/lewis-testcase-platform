import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { useForm } from 'react-hook-form'
import { Eye, EyeOff, Loader2 } from 'lucide-react'
import { authApi } from '@/api/auth'
import { useAuthStore } from '@/store/authStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/utils/cn'
import { LoginAmbientCanvas } from '@/components/auth/LoginAmbientCanvas'
import { LoginFloatingDecor } from '@/components/auth/LoginFloatingDecor'
import { LoginMascot, type LoginMascotMood } from '@/components/auth/LoginMascot'

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
    const onMove = (e: MouseEvent) => {
      if (!mascot) return
      const r = mascot.getBoundingClientRect()
      const cx = r.left + r.width / 2
      const cy = r.top + r.height / 2
      let nx = (e.clientX - cx) / Math.max(r.width / 2, 1)
      let ny = (e.clientY - cy) / Math.max(r.height / 2, 1)
      if (userFocus && usernameEl) {
        const ir = usernameEl.getBoundingClientRect()
        const ix = (ir.left + ir.right) / 2
        const iy = (ir.top + ir.bottom) / 2
        const tx = (ix - cx) / Math.max(r.width / 2, 1)
        const ty = (iy - cy) / Math.max(r.height / 2, 1)
        nx = nx * 0.5 + tx * 0.5
        ny = ny * 0.5 + ty * 0.5
      }
      setLook({ x: clamp(nx, -1, 1), y: clamp(ny, -1, 1) })
    }
    window.addEventListener('mousemove', onMove, { passive: true })
    return () => window.removeEventListener('mousemove', onMove)
  }, [userFocus])

  const eyesMode = showPassword
    ? 'cautious'
    : pwdFocus || passwordValue.length > 0
      ? 'closed'
      : 'track'

  let mascotMood: LoginMascotMood = 'idle'
  if (loading) mascotMood = 'loading'
  else if (authError) mascotMood = 'error'
  else if (userFocus && usernameValue.trim().length > 0 && !pwdFocus) mascotMood = 'listening'

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

  const inputRing =
    'rounded-xl border border-slate-200/90 bg-white text-slate-900 shadow-sm shadow-slate-900/5 ring-0 transition-[transform,box-shadow,background-color] duration-200 placeholder:text-slate-400 focus-visible:-translate-y-px focus-visible:border-transparent focus-visible:bg-white focus-visible:shadow-[0_0_0_2px_rgba(34,211,238,0.45),0_0_24px_-8px_rgba(99,102,241,0.2)] focus-visible:outline-none'

  return (
    <div className="relative isolate min-h-[100dvh] w-full overflow-hidden bg-[#060b16] text-slate-100">
      <div className="login-page-bg pointer-events-none absolute inset-0" aria-hidden />
      <div
        className="pointer-events-none absolute -left-[14%] top-[10%] h-[min(48vw,400px)] w-[min(48vw,400px)] rounded-full bg-cyan-400/[0.09] blur-[100px] motion-reduce:opacity-0"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute right-[-8%] top-[22%] h-[min(42vw,340px)] w-[min(42vw,340px)] rounded-full bg-violet-500/[0.1] blur-[110px] motion-reduce:opacity-0"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute bottom-[5%] left-[18%] h-[min(38vw,300px)] w-[min(38vw,300px)] rounded-full bg-orange-400/[0.07] blur-[95px] motion-reduce:opacity-0"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute bottom-[20%] right-[12%] h-[min(32vw,260px)] w-[min(32vw,260px)] rounded-full bg-emerald-400/[0.06] blur-[90px] motion-reduce:opacity-0"
        aria-hidden
      />
      <div className="login-grain pointer-events-none absolute inset-0" aria-hidden />
      <LoginAmbientCanvas />

      <div className="relative z-[1] mx-auto flex min-h-[100dvh] w-full max-w-6xl flex-col items-center justify-center px-4 py-10 sm:px-6 sm:py-12 lg:px-8 lg:py-14">
        <div className="grid w-full max-w-[1080px] grid-cols-1 items-center gap-10 lg:grid-cols-2 lg:gap-x-16 lg:gap-y-8">
          {/* 左：品牌 + 趣味视觉 */}
          <aside className="relative order-2 flex min-h-0 flex-col justify-center lg:order-1">
            <LoginFloatingDecor />
            <div className="login-enter login-enter-delay-1 relative z-[1] mx-auto w-full max-w-lg text-center lg:mx-0 lg:text-left">
              <div className="mb-6 flex flex-col items-center gap-4 sm:mb-8 lg:flex-row lg:items-start">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-400 via-blue-500 to-violet-500 shadow-[0_14px_40px_-12px_rgba(56,189,248,0.55)] ring-2 ring-white/20">
                  <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-white">AI</span>
                </div>
                <div className="space-y-2">
                  <h1 className="text-balance text-2xl font-semibold tracking-tight text-white sm:text-3xl lg:text-[1.85rem]">
                    让测试用例自己跑起来
                  </h1>
                  <p className="mx-auto max-w-md text-pretty text-sm leading-relaxed text-slate-400 sm:text-[15px] lg:mx-0">
                    把需求、图片、OCR 和业务规则转成可评审、可执行的测试用例。
                  </p>
                </div>
              </div>

              <div
                ref={mascotRef}
                className="login-enter login-enter-delay-2 relative z-[1] mt-4 flex justify-center lg:mt-2 lg:justify-start"
              >
                <div
                  key={`mascot-shake-${shakeId}`}
                  className={cn(shakeId > 0 && 'login-mascot-head-shake-once')}
                >
                  <LoginMascot look={look} eyesMode={eyesMode} mood={mascotMood} />
                </div>
              </div>

              <p className="login-enter login-enter-delay-3 mx-auto mt-6 hidden max-w-md text-center text-xs leading-relaxed text-slate-500 sm:block lg:mx-0 lg:text-left">
                Welcome back to your AI testing cockpit — OCR、多模态与团队工作流，一站完成。
              </p>
            </div>
          </aside>

          {/* 右：浅色磨砂登录卡 */}
          <main className="relative z-[1] order-1 flex w-full justify-center lg:order-2">
            <div
              key={`login-card-${shakeId}`}
              className={cn(
                'login-enter login-enter-delay-2 w-full max-w-[min(100%,420px)]',
                shakeId > 0 && 'login-shake-once',
                loading && 'login-card-busy-light',
              )}
            >
              <div className="rounded-[1.45rem] bg-gradient-to-br from-cyan-400/50 via-violet-400/35 to-amber-300/40 p-[1px] shadow-[0_28px_64px_-28px_rgba(15,23,42,0.35)]">
                <div className="rounded-[1.4rem] bg-white/[0.94] px-5 py-7 shadow-inner shadow-white/40 backdrop-blur-xl sm:px-8 sm:py-8">
                  <header className="login-enter login-enter-delay-3 mb-6 space-y-1.5">
                    <h2 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-[1.35rem]">欢迎回来</h2>
                    <p className="text-[13px] leading-relaxed text-slate-600 sm:text-sm">
                      继续管理你的 AI 测试用例与团队工作流
                    </p>
                  </header>

                  <form onSubmit={handleSubmit(onSubmit)} noValidate>
                    <div className="login-enter login-enter-delay-4 space-y-4 sm:space-y-5">
                      {authError && (
                        <div
                          role="alert"
                          className="rounded-xl border border-red-200 bg-red-50/95 px-3.5 py-2.5 text-red-800"
                        >
                          <p className="text-sm font-medium leading-relaxed">{authError}</p>
                        </div>
                      )}

                      <div className="space-y-1.5">
                        <label htmlFor="login-username" className="text-[13px] font-medium text-slate-700">
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
                          className={cn(
                            inputRing,
                            'h-11',
                            errors.username && 'border-red-300 shadow-[0_0_0_2px_rgba(248,113,113,0.35)]',
                          )}
                          aria-invalid={errors.username ? true : undefined}
                          aria-describedby={errors.username ? 'login-username-error' : undefined}
                        />
                        {errors.username && (
                          <p id="login-username-error" className="text-xs font-medium text-red-600">
                            {errors.username.message}
                          </p>
                        )}
                      </div>

                      <div className="space-y-1.5">
                        <label htmlFor="login-password" className="text-[13px] font-medium text-slate-700">
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
                              inputRing,
                              'h-11 pr-11',
                              errors.password && 'border-red-300 shadow-[0_0_0_2px_rgba(248,113,113,0.35)]',
                            )}
                            aria-invalid={errors.password ? true : undefined}
                            aria-describedby={errors.password ? 'login-password-error' : undefined}
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className={cn(
                              'absolute right-2 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg',
                              'text-slate-500 transition-colors duration-200',
                              'hover:bg-slate-100 hover:text-slate-800',
                              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50 focus-visible:ring-offset-2 focus-visible:ring-offset-white',
                              'active:scale-95 motion-reduce:active:scale-100',
                            )}
                            aria-label={showPassword ? '隐藏密码' : '显示密码'}
                          >
                            {showPassword ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
                          </button>
                        </div>
                        {errors.password && (
                          <p id="login-password-error" className="text-xs font-medium text-red-600">
                            {errors.password.message}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="login-enter login-enter-delay-5 mt-6 flex flex-col gap-3 sm:mt-7">
                      <label className="flex cursor-pointer select-none items-center gap-2.5 text-[13px] text-slate-600 transition-colors hover:text-slate-800">
                        <input
                          type="checkbox"
                          checked={rememberMe}
                          onChange={(e) => setRememberMe(e.target.checked)}
                          className="h-4 w-4 rounded border-slate-300 bg-white text-sky-600 accent-sky-600 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50 focus-visible:ring-offset-2 focus-visible:ring-offset-white"
                        />
                        <span>记住我</span>
                      </label>
                      <Button
                        type="submit"
                        variant="default"
                        disabled={loading}
                        aria-busy={loading}
                        className={cn(
                          'login-btn-shine relative h-11 w-full overflow-hidden rounded-xl font-medium text-white',
                          'bg-gradient-to-r from-sky-500 via-blue-600 to-cyan-500 bg-[length:120%_100%]',
                          'shadow-lg shadow-sky-900/25',
                          'transition-[transform,box-shadow,filter] duration-200',
                          'hover:enabled:translate-y-[-1px] hover:enabled:shadow-xl hover:enabled:shadow-sky-900/30',
                          'active:enabled:translate-y-px active:enabled:brightness-95',
                          'disabled:opacity-70',
                        )}
                      >
                        {loading && <Loader2 className="mr-2 h-4 w-4 shrink-0 animate-spin" aria-hidden />}
                        {loading ? '登录中...' : '登录'}
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
