import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { useForm } from "react-hook-form";
import { AlertCircle, ArrowLeft, CheckCircle2, Eye, EyeOff, KeyRound, Loader2, Mail, RefreshCw, ShieldCheck } from "lucide-react";
import { authApi } from "@/api/auth";
import { useAuthStore } from "@/store/authStore";
import { useThemeStore } from "@/store/themeStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/utils/cn";
import { LoginAmbientCanvas } from "@/components/auth/LoginAmbientCanvas";
import { LoginBrandIcon } from "@/components/auth/LoginBrandIcon";
import { LoginMascotStageDecor } from "@/components/auth/LoginMascotStageDecor";
import { PasswordStrength } from "@/components/PasswordStrength";
import {
  LoginMascot,
  type LoginMascotMood,
} from "@/components/auth/LoginMascot";
import { LoginThemeToggle } from "@/components/auth/LoginThemeToggle";
import type { CaptchaChallenge } from "@/types";

/** 简单邮箱格式（与后端 LoginDto 的邮箱分支一致） */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const passwordPolicyMessage = (value: string) => {
  if (value.length < 6) return "密码至少 6 位";
  if (!/[a-z]/.test(value)) return "需包含小写字母";
  if (!/[A-Z]/.test(value)) return "需包含大写字母";
  if (!/\d/.test(value)) return "需包含数字";
  if (!/[^a-zA-Z0-9]/.test(value)) return "需包含特殊字符";
  return true;
};

interface LoginForm {
  email: string;
  password: string;
  captchaCode: string;
}

interface RegisterForm {
  email: string;
  password: string;
  confirmPassword: string;
  inviteCode: string;
  captchaCode: string;
}

interface CodeForm {
  code: string;
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const routeMode = location.pathname === "/register" ? "register" : "login";
  const theme = useThemeStore((s) => s.theme);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const setAuth = useAuthStore((s) => s.setAuth);
  const authError = useAuthStore((s) => s.error);
  const setError = useAuthStore((s) => s.setError);
  const loading = useAuthStore((s) => s.loading);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [userFocus, setUserFocus] = useState(false);
  const [pwdFocus, setPwdFocus] = useState(false);
  const [look, setLook] = useState({ x: 0, y: 0 });
  const [shakeId, setShakeId] = useState(0);
  const [celebrate, setCelebrate] = useState(false);
  const [captcha, setCaptcha] = useState<CaptchaChallenge | null>(null);
  const [captchaLoading, setCaptchaLoading] = useState(false);
  const [registerStep, setRegisterStep] = useState<"form" | "code">("form");
  const [pendingEmail, setPendingEmail] = useState("");
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [formNotice, setFormNotice] = useState<{
    tone: "error" | "warning" | "success";
    title: string;
    message: string;
    details?: string[];
  } | null>(null);
  const mascotRef = useRef<HTMLDivElement>(null);
  const prevLoading = useRef(loading);

  /** 已登录时访问 /login：等 auth persist 恢复后进入工作台（与 PrivateRoute 首帧误判修复配套） */
  useEffect(() => {
    const go = () => {
      if (useAuthStore.getState().isAuthenticated) {
        navigate("/dashboard", { replace: true });
      }
    };
    if (useAuthStore.persist.hasHydrated()) {
      go();
      return;
    }
    const unsub = useAuthStore.persist.onFinishHydration(go);
    return unsub;
  }, [navigate, isAuthenticated]);

  const loginForm = useForm<LoginForm>({
    defaultValues: { email: "", password: "", captchaCode: "" },
  });
  const registerForm = useForm<RegisterForm>({
    defaultValues: {
      email: "",
      password: "",
      confirmPassword: "",
      inviteCode: "",
      captchaCode: "",
    },
  });
  const codeForm = useForm<CodeForm>({ defaultValues: { code: "" } });

  const passwordValue = loginForm.watch("password") ?? "";
  const emailValue = loginForm.watch("email") ?? "";
  const registerPasswordValue = registerForm.watch("password") ?? "";

  const emailReg = loginForm.register("email", {
    required: "请输入电子邮箱",
    maxLength: { value: 255, message: "过长" },
    pattern: { value: EMAIL_RE, message: "邮箱格式不正确" },
  });

  const passwordReg = loginForm.register("password", {
    required: "请输入密码",
    minLength: { value: 6, message: "密码至少6位" },
  });

  const captchaReg = loginForm.register("captchaCode", {
    required: "请输入图形验证码",
    minLength: { value: 4, message: "验证码至少4个字符" },
  });

  const activeMode = routeMode === "register" ? (registerStep === "code" ? "code" : "register") : "login";
  const activeCaptchaAction = routeMode === "register" ? "register" : "login";

  const loadCaptcha = async (action: "login" | "register" = activeCaptchaAction) => {
    setCaptchaLoading(true);
    try {
      setCaptcha(await authApi.getCaptcha(action));
    } catch {
      setFormNotice({
        tone: "error",
        title: "图形验证码加载失败",
        message: "请检查网络后刷新验证码。",
      });
    } finally {
      setCaptchaLoading(false);
    }
  };

  useEffect(() => {
    setFormNotice(null);
    if (routeMode === "login") {
      setRegisterStep("form");
      setPendingEmail("");
      codeForm.reset({ code: "" });
      void loadCaptcha("login");
      return;
    }
    if (registerStep === "form") {
      codeForm.reset({ code: "" });
      void loadCaptcha("register");
    }
  }, [routeMode, registerStep]);

  const loginErrors = loginForm.formState.errors;
  const registerErrors = registerForm.formState.errors;
  const codeErrors = codeForm.formState.errors;

  useEffect(() => {
    if (prevLoading.current && !loading && authError) {
      setShakeId((n) => n + 1);
    }
    prevLoading.current = loading;
  }, [loading, authError]);

  useEffect(() => {
    const mascot = mascotRef.current;
    const usernameEl = document.getElementById("login-username");
    const passwordEl = document.getElementById("login-password");
    const onMove = (e: MouseEvent) => {
      if (!mascot) return;
      const r = mascot.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      let nx = (e.clientX - cx) / Math.max(r.width / 2, 1);
      let ny = (e.clientY - cy) / Math.max(r.height / 2, 1);
      if (pwdFocus && passwordEl) {
        const ir = passwordEl.getBoundingClientRect();
        const ix = (ir.left + ir.right) / 2;
        const iy = (ir.top + ir.bottom) / 2;
        const tx = (ix - cx) / Math.max(r.width / 2, 1);
        const ty = (iy - cy) / Math.max(r.height / 2, 1);
        nx = nx * 0.3 + tx * 0.7;
        ny = ny * 0.3 + ty * 0.7;
      } else if (userFocus && usernameEl) {
        const ir = usernameEl.getBoundingClientRect();
        const ix = (ir.left + ir.right) / 2;
        const iy = (ir.top + ir.bottom) / 2;
        const tx = (ix - cx) / Math.max(r.width / 2, 1);
        const ty = (iy - cy) / Math.max(r.height / 2, 1);
        nx = nx * 0.45 + tx * 0.55;
        ny = ny * 0.45 + ty * 0.55;
      }
      setLook({ x: clamp(nx, -1, 1), y: clamp(ny, -1, 1) });
    };
    window.addEventListener("mousemove", onMove, { passive: true });
    return () => window.removeEventListener("mousemove", onMove);
  }, [userFocus, pwdFocus]);

  const eyesMode = showPassword
    ? "cautious"
    : pwdFocus || passwordValue.length > 0
      ? "closed"
      : "track";

  let mascotMood: LoginMascotMood = "idle";
  if (celebrate) mascotMood = "success";
  else if (loading) mascotMood = "loading";
  else if (authError) mascotMood = "error";
  else if (userFocus && emailValue.trim().length > 0 && !pwdFocus)
    mascotMood = "listening";

  const onSubmit = async (data: LoginForm) => {
    setError(null);
    setFormNotice(null);
    if (!captcha?.captchaId) {
      setFormNotice({
        tone: "warning",
        title: "请先刷新验证码",
        message: "图形验证码加载完成后再提交登录。",
      });
      return;
    }
    try {
      const result = await authApi.login({
        email: data.email,
        password: data.password,
        captchaId: captcha.captchaId,
        captchaCode: data.captchaCode,
      });
      setAuth(result.user, result.accessToken, rememberMe);
      toast.success("登录成功");
      setCelebrate(true);
      await new Promise((r) => setTimeout(r, 300));
      setCelebrate(false);
      navigate("/dashboard");
    } catch {
      /* 错误已由 axios 拦截器与 authApi setError 处理 */
      void loadCaptcha();
    }
  };

  const onRegisterSendCode = async (data: RegisterForm) => {
    setError(null);
    setFormNotice(null);
    if (!captcha?.captchaId) {
      setFormNotice({
        tone: "warning",
        title: "请先刷新验证码",
        message: "图形验证码加载完成后再发送邮箱验证码。",
      });
      return;
    }
    try {
      const meta = await authApi.sendRegisterCode({
        email: data.email.trim().toLowerCase(),
        password: data.password,
        confirmPassword: data.confirmPassword,
        inviteCode: data.inviteCode,
        captchaId: captcha.captchaId,
        captchaCode: data.captchaCode,
      });
      if (meta.mailConfigured === false) {
        setFormNotice({
          tone: "warning",
          title: "发信通道未配置",
          message: "邮箱验证码没有发出。请在 VPS 环境配置 Resend 或 SMTP 后再邀请朋友注册。",
          details: meta.mailIssues ?? [],
        });
        void loadCaptcha("register");
        return;
      }
      setPendingEmail(meta.email);
      codeForm.reset({ code: "" });
      setRegisterStep("code");
      setFormNotice({
        tone: "success",
        title: "验证码已发送",
        message: "请查看邮箱收件箱或垃圾箱，验证码 15 分钟内有效。",
      });
    } catch {
      void loadCaptcha("register");
    }
  };

  const onConfirmCode = async (data: CodeForm) => {
    setError(null);
    setFormNotice(null);
    try {
      const result = await authApi.confirmRegister({
        email: pendingEmail,
        code: data.code.replace(/\s/g, ""),
      });
      setAuth(result.user, result.accessToken, false);
      toast.success("注册成功");
      navigate("/dashboard", { replace: true });
    } catch {
      /* 错误已由 axios 拦截器与 authApi setError 处理 */
    }
  };

  const handleResend = async () => {
    if (!pendingEmail) return;
    setError(null);
    setFormNotice(null);
    try {
      await authApi.resendRegisterCode(pendingEmail);
      setFormNotice({
        tone: "success",
        title: "已重新发送",
        message: "若该邮箱仍处于待验证状态，会收到新的验证码。",
      });
    } catch {
      /* 错误已由 axios 拦截器与 authApi setError 处理 */
    }
  };

  const showTerms = (kind: "terms" | "privacy") => {
    setFormNotice({
      tone: "warning",
      title: kind === "terms" ? "服务条款" : "隐私政策",
      message:
        kind === "terms"
          ? "当前为灰度测试邀请注册，账号仅用于 AI 用例平台体验与问题反馈。"
          : "当前仅收集注册邮箱、用户名和必要登录状态，用于账号识别和安全校验。",
    });
  };

  const inputBase = cn(
    "login-soft-input flex h-[52px] w-full rounded-[15px] border-0 px-4 text-[15px] !shadow-none !ring-0",
    "hover:!ring-0 focus-visible:!ring-0 focus-visible:!ring-offset-0",
    "active:scale-[0.998] motion-reduce:active:scale-100 motion-reduce:focus-visible:translate-y-0",
  );

  const notice = authError
    ? {
        tone: "error" as const,
        title: "操作未完成",
        message: authError,
      }
    : formNotice;

  const formTitle =
    activeMode === "login" ? "欢迎回来" : activeMode === "register" ? "创建新账号" : "验证邮箱";
  const formSubtitle =
    activeMode === "login"
      ? "继续管理你的 AI 测试用例与团队工作流"
      : activeMode === "register"
        ? "仅限邀请注册：邮箱、密码、图形验证码、邀请码和邮箱验证码"
        : `我们已向 ${pendingEmail} 发送 6 位验证码`;

  return (
    <div className="login-page-root relative isolate min-h-[100dvh] w-full overflow-x-hidden overflow-y-auto transition-colors duration-300 ease-out">
      <LoginThemeToggle className="fixed right-4 top-4 z-[80] sm:right-7 sm:top-7" />

      <div
        className="login-page-bg pointer-events-none absolute inset-0 transition-[background] duration-300 ease-out"
        aria-hidden
      />
      <div
        className="login-blob -left-[14%] top-[10%] z-0 h-[min(48vw,400px)] w-[min(48vw,400px)] motion-reduce:opacity-0"
        style={{ background: "var(--lp-blob-a)" }}
        aria-hidden
      />
      <div
        className="login-blob right-[-8%] top-[22%] z-0 h-[min(42vw,340px)] w-[min(42vw,340px)] motion-reduce:opacity-0"
        style={{ background: "var(--lp-blob-b)" }}
        aria-hidden
      />
      <div
        className="login-blob bottom-[5%] left-[18%] z-0 h-[min(38vw,300px)] w-[min(38vw,300px)] motion-reduce:opacity-0"
        style={{ background: "var(--lp-blob-c)" }}
        aria-hidden
      />
      <div
        className="login-blob bottom-[20%] right-[12%] z-0 h-[min(32vw,260px)] w-[min(32vw,260px)] motion-reduce:opacity-0"
        style={{ background: "var(--lp-blob-d)" }}
        aria-hidden
      />
      <div
        className="login-grain pointer-events-none absolute inset-0 z-0 transition-opacity duration-300"
        aria-hidden
      />
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
                    style={{ color: "var(--lp-eyebrow)" }}
                  >
                    AI 用例平台
                  </p>
                  <h1
                    className="text-balance text-2xl font-semibold tracking-tight transition-colors duration-300 sm:text-3xl lg:text-[1.9rem]"
                    style={{ color: "var(--lp-text-primary)" }}
                  >
                    让测试用例自己跑起来
                  </h1>
                  <p
                    className="mx-auto max-w-full whitespace-nowrap text-sm leading-relaxed transition-colors duration-300 sm:text-[15px] lg:mx-0"
                    style={{ color: "var(--lp-text-secondary)" }}
                  >
                    把需求、图片、OCR 和业务规则转成可评审、可执行的测试用例。
                  </p>
                </div>
              </div>
            </header>

            <div className="relative z-10 mt-2 flex w-full justify-center lg:justify-start">
              <div className="login-mascot-stage relative flex w-full max-w-[380px] min-h-[220px] items-center justify-center sm:min-h-[260px] lg:min-h-[280px]">
                <div
                  className="pointer-events-none absolute inset-0 hidden lg:block"
                  aria-hidden
                >
                  <LoginMascotStageDecor />
                </div>
                <div
                  ref={mascotRef}
                  className="login-enter login-enter-delay-2 relative z-[2] flex justify-center"
                >
                  <div
                    key={`mascot-shake-${shakeId}`}
                    className={cn(
                      shakeId > 0 && "login-mascot-head-shake-once",
                    )}
                  >
                    <LoginMascot
                      look={look}
                      eyesMode={eyesMode}
                      mood={mascotMood}
                      passwordHiddenGlow={
                        !showPassword && passwordValue.length > 0
                      }
                    />
                  </div>
                </div>
              </div>
            </div>

            <footer
              className="login-enter login-enter-delay-3 relative z-20 mx-auto mt-8 hidden max-w-xl px-10 text-center text-xs leading-relaxed transition-colors duration-300 sm:block lg:mx-0 lg:text-left"
              style={{ color: "var(--lp-footer)" }}
            >
              Friendly AI workspace：OCR、多模态与团队工作流，一站完成。
            </footer>
          </aside>

          <main className="relative z-[6] order-1 flex w-full justify-center lg:order-2">
            {/* Shake 单独一层：避免 login-shake-once 覆盖 login-enter 的 fade-up，opacity 卡在 0 */}
            <div
              className={cn(
                "login-enter login-enter-delay-2 w-full",
                activeMode === "login" ? "max-w-[min(100%,420px)]" : "max-w-[min(100%,480px)]",
              )}
            >
              <div
                key={`login-card-shake-${shakeId}`}
                className={cn(shakeId > 0 && "login-shake-once")}
              >
                <div
                  className={cn(
                    "login-panel-shell rounded-[30px] p-px transition-[box-shadow,filter] duration-300",
                    loading && "login-card-busy-light",
                  )}
                >
                  <div className="login-panel-body rounded-[29px] px-6 py-8 transition-[background,box-shadow] duration-300 sm:px-8 sm:py-9">
                    <header className="login-enter login-enter-delay-3 mb-7 space-y-2">
                      <h2
                        className="text-xl font-semibold tracking-tight sm:text-[1.35rem]"
                        style={{ color: "var(--lp-card-title)" }}
                      >
                        {formTitle}
                      </h2>
                      <p
                        className="text-[13px] leading-relaxed sm:text-sm"
                        style={{ color: "var(--lp-card-muted)" }}
                      >
                        {formSubtitle}
                      </p>
                    </header>

                    {notice && (
                      <div
                        role="alert"
                        className={cn(
                          "login-enter login-enter-delay-4 mb-5 rounded-2xl border px-4 py-3 shadow-sm backdrop-blur",
                          notice.tone === "error" &&
                            "border-rose-300/35 bg-rose-500/12 text-rose-50",
                          notice.tone === "warning" &&
                            "border-amber-300/35 bg-amber-400/12 text-amber-50",
                          notice.tone === "success" &&
                            "border-emerald-300/35 bg-emerald-400/12 text-emerald-50",
                        )}
                      >
                        <div className="flex gap-3">
                          {notice.tone === "success" ? (
                            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                          ) : (
                            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                          )}
                          <div className="min-w-0 space-y-1">
                            <p className="text-sm font-semibold leading-5">{notice.title}</p>
                            <p className="text-[13px] leading-5 opacity-90">{notice.message}</p>
                            {notice.details?.length ? (
                              <ul className="space-y-0.5 pt-1 text-xs leading-5 opacity-80">
                                {notice.details.map((item) => (
                                  <li key={item}>{item}</li>
                                ))}
                              </ul>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    )}

                    {activeMode === "login" && (
                      <form onSubmit={loginForm.handleSubmit(onSubmit)} noValidate>
                      <div className="login-enter login-enter-delay-4 space-y-5">
                        <div className="group/login-user space-y-2">
                          <label
                            htmlFor="login-username"
                            className="text-[13px] font-medium transition-colors duration-200 group-focus-within/login-user:text-[color:var(--lp-label-focus)]"
                            style={{ color: "var(--lp-label)" }}
                          >
                            电子邮箱
                          </label>
                          <Input
                            id="login-username"
                            type="email"
                            autoComplete="email"
                            placeholder="请输入已注册邮箱"
                            {...emailReg}
                            onFocus={() => setUserFocus(true)}
                            onBlur={(e) => {
                              setUserFocus(false);
                              void emailReg.onBlur(e);
                            }}
                            className={cn(
                              inputBase,
                              loginErrors.email && "login-soft-input--error",
                            )}
                            aria-invalid={loginErrors.email ? true : undefined}
                            aria-describedby={
                              loginErrors.email
                                ? "login-username-error"
                                : undefined
                            }
                          />
                          {loginErrors.email && (
                            <p
                              id="login-username-error"
                              className="text-xs font-medium text-red-500 dark:text-red-400"
                            >
                              {loginErrors.email.message}
                            </p>
                          )}
                        </div>

                        <div className="group/login-pwd space-y-2">
                          <label
                            htmlFor="login-password"
                            className="text-[13px] font-medium transition-colors duration-200 group-focus-within/login-pwd:text-[color:var(--lp-label-focus)]"
                            style={{ color: "var(--lp-label)" }}
                          >
                            密码
                          </label>
                          <div className="relative">
                            <Input
                              id="login-password"
                              type={showPassword ? "text" : "password"}
                              autoComplete="current-password"
                              placeholder="请输入密码"
                              {...passwordReg}
                              onFocus={() => setPwdFocus(true)}
                              onBlur={(e) => {
                                setPwdFocus(false);
                                void passwordReg.onBlur(e);
                              }}
                              className={cn(
                                inputBase,
                                "login-soft-input--password pr-12",
                                loginErrors.password && "login-soft-input--error",
                              )}
                              aria-invalid={loginErrors.password ? true : undefined}
                              aria-describedby={
                                loginErrors.password
                                  ? "login-password-error"
                                  : undefined
                              }
                            />
                            <button
                              type="button"
                              onClick={() => setShowPassword(!showPassword)}
                              className={cn(
                                "login-pwd-toggle absolute right-2.5 top-1/2 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-xl transition-colors duration-200",
                                "hover:bg-[color:var(--lp-icon-btn-hover-bg)] hover:text-[color:var(--lp-icon-btn-hover)]",
                                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/35 focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--lp-checkbox-ring-offset)]",
                                "active:scale-95 motion-reduce:active:scale-100",
                              )}
                              style={{ color: "var(--lp-icon-btn)" }}
                              aria-label={
                                showPassword ? "隐藏密码" : "显示密码"
                              }
                            >
                              {showPassword ? (
                                <EyeOff
                                  className="h-[1.1rem] w-[1.1rem] stroke-[1.5]"
                                  aria-hidden
                                />
                              ) : (
                                <Eye
                                  className="h-[1.1rem] w-[1.1rem] stroke-[1.5]"
                                  aria-hidden
                                />
                              )}
                            </button>
                          </div>
                          {loginErrors.password && (
                            <p
                              id="login-password-error"
                              className="text-xs font-medium text-red-500 dark:text-red-400"
                            >
                              {loginErrors.password.message}
                            </p>
                          )}
                        </div>

                        <div className="group/login-captcha space-y-2">
                          <label
                            htmlFor="login-captcha"
                            className="flex items-center gap-2 text-[13px] font-medium transition-colors duration-200 group-focus-within/login-captcha:text-[color:var(--lp-label-focus)]"
                            style={{ color: "var(--lp-label)" }}
                          >
                            <ShieldCheck className="h-4 w-4" aria-hidden />
                            图形验证码
                          </label>
                          <div className="grid grid-cols-[minmax(0,1fr)_132px] gap-2">
                            <Input
                              id="login-captcha"
                              type="text"
                              autoComplete="off"
                              placeholder="输入图中字符"
                              {...captchaReg}
                              className={cn(
                                inputBase,
                                "h-[48px]",
                                loginErrors.captchaCode && "login-soft-input--error",
                              )}
                              aria-invalid={loginErrors.captchaCode ? true : undefined}
                              aria-describedby={
                                loginErrors.captchaCode
                                  ? "login-captcha-error"
                                  : undefined
                              }
                            />
                            <button
                              type="button"
                              onClick={() => void loadCaptcha("login")}
                              disabled={captchaLoading}
                              className="flex h-[48px] items-center justify-center overflow-hidden rounded-[15px] border border-white/15 bg-white/70 text-sm shadow-sm transition hover:bg-white/85 disabled:opacity-60 dark:bg-white/10 dark:hover:bg-white/15"
                              aria-label="刷新图形验证码"
                              title="点击刷新验证码"
                            >
                              {captchaLoading || !captcha ? (
                                <RefreshCw className="h-4 w-4 animate-spin" aria-hidden />
                              ) : (
                                <span
                                  className="flex h-full w-full items-center justify-center [&>svg]:h-full [&>svg]:w-full"
                                  dangerouslySetInnerHTML={{ __html: captcha.imageSvg }}
                                />
                              )}
                            </button>
                          </div>
                          {loginErrors.captchaCode && (
                            <p
                              id="login-captcha-error"
                              className="text-xs font-medium text-red-500 dark:text-red-400"
                            >
                              {loginErrors.captchaCode.message}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="login-enter login-enter-delay-5 mt-7 flex flex-col gap-4">
                        <label
                          className="flex cursor-pointer select-none items-center gap-3 text-[13px] transition-colors duration-200"
                          style={{ color: "var(--lp-label)" }}
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
                            "login-btn-shine login-submit-btn relative h-[54px] w-full overflow-hidden rounded-2xl border-0 px-4 text-[15px] font-semibold text-white !ring-0",
                            "transition-[transform,box-shadow,filter] duration-200",
                            "hover:enabled:-translate-y-0.5",
                            "active:enabled:translate-y-px active:enabled:brightness-[0.97]",
                            "disabled:opacity-65 disabled:hover:translate-y-0",
                            loading && "login-submit-btn--busy",
                          )}
                        >
                          <span className="relative z-[1] inline-flex items-center justify-center gap-2">
                            {loading && (
                              <Loader2
                                className="h-4 w-4 shrink-0 animate-spin"
                                aria-hidden
                              />
                            )}
                            {loading ? "登录中..." : "登录"}
                          </span>
                        </Button>
                        <p
                          className="text-center text-[13px] leading-6"
                          style={{ color: "var(--lp-card-muted)" }}
                        >
                          没有账号？{" "}
                          <Link
                            to="/register"
                            className="font-semibold text-cyan-200 underline-offset-4 transition hover:text-cyan-100 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/50"
                          >
                            邀请码注册
                          </Link>
                        </p>
                      </div>
                    </form>
                    )}

                    {activeMode === "register" && (
                      <form onSubmit={registerForm.handleSubmit(onRegisterSendCode)} noValidate>
                        <div className="login-enter login-enter-delay-4 space-y-4">
                          <div className="space-y-2">
                            <label
                              htmlFor="register-email"
                              className="flex items-center gap-2 text-[13px] font-medium"
                              style={{ color: "var(--lp-label)" }}
                            >
                              <Mail className="h-4 w-4" aria-hidden />
                              邮箱
                            </label>
                            <Input
                              id="register-email"
                              type="email"
                              autoComplete="email"
                              placeholder="请输入邮箱地址"
                              {...registerForm.register("email", {
                                required: "请输入邮箱地址",
                                pattern: { value: EMAIL_RE, message: "邮箱格式不正确" },
                              })}
                              className={cn(inputBase, registerErrors.email && "login-soft-input--error")}
                              aria-invalid={registerErrors.email ? true : undefined}
                            />
                            {registerErrors.email && (
                              <p className="text-xs font-medium text-red-500 dark:text-red-400">
                                {registerErrors.email.message}
                              </p>
                            )}
                          </div>

                          <div className="space-y-2">
                            <label
                              htmlFor="register-password"
                              className="text-[13px] font-medium"
                              style={{ color: "var(--lp-label)" }}
                            >
                              密码
                            </label>
                            <div className="relative">
                              <Input
                                id="register-password"
                                type={showPassword ? "text" : "password"}
                                autoComplete="new-password"
                                placeholder="请输入密码"
                                {...registerForm.register("password", {
                                  required: "请输入密码",
                                  validate: passwordPolicyMessage,
                                })}
                                className={cn(
                                  inputBase,
                                  "login-soft-input--password pr-12",
                                  registerErrors.password && "login-soft-input--error",
                                )}
                                aria-invalid={registerErrors.password ? true : undefined}
                              />
                              <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-2.5 top-1/2 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-xl transition hover:bg-white/10"
                                style={{ color: "var(--lp-icon-btn)" }}
                                aria-label={showPassword ? "隐藏密码" : "显示密码"}
                              >
                                {showPassword ? (
                                  <EyeOff className="h-[1.1rem] w-[1.1rem] stroke-[1.5]" aria-hidden />
                                ) : (
                                  <Eye className="h-[1.1rem] w-[1.1rem] stroke-[1.5]" aria-hidden />
                                )}
                              </button>
                            </div>
                            {registerErrors.password && (
                              <p className="text-xs font-medium text-red-500 dark:text-red-400">
                                {registerErrors.password.message}
                              </p>
                            )}
                            <PasswordStrength password={registerPasswordValue} />
                          </div>

                          <div className="space-y-2">
                            <label
                              htmlFor="register-confirm-password"
                              className="text-[13px] font-medium"
                              style={{ color: "var(--lp-label)" }}
                            >
                              确认密码
                            </label>
                            <div className="relative">
                              <Input
                                id="register-confirm-password"
                                type={showConfirmPassword ? "text" : "password"}
                                autoComplete="new-password"
                                placeholder="请再次输入密码"
                                {...registerForm.register("confirmPassword", {
                                  required: "请再次输入密码",
                                  validate: (value) =>
                                    value === registerPasswordValue || "两次输入的密码不一致",
                                })}
                                className={cn(
                                  inputBase,
                                  "login-soft-input--password pr-12",
                                  registerErrors.confirmPassword && "login-soft-input--error",
                                )}
                                aria-invalid={registerErrors.confirmPassword ? true : undefined}
                              />
                              <button
                                type="button"
                                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                className="absolute right-2.5 top-1/2 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-xl transition hover:bg-white/10"
                                style={{ color: "var(--lp-icon-btn)" }}
                                aria-label={showConfirmPassword ? "隐藏确认密码" : "显示确认密码"}
                              >
                                {showConfirmPassword ? (
                                  <EyeOff className="h-[1.1rem] w-[1.1rem] stroke-[1.5]" aria-hidden />
                                ) : (
                                  <Eye className="h-[1.1rem] w-[1.1rem] stroke-[1.5]" aria-hidden />
                                )}
                              </button>
                            </div>
                            {registerErrors.confirmPassword && (
                              <p className="text-xs font-medium text-red-500 dark:text-red-400">
                                {registerErrors.confirmPassword.message}
                              </p>
                            )}
                          </div>

                          <div className="space-y-2">
                            <label
                              htmlFor="register-captcha"
                              className="flex items-center gap-2 text-[13px] font-medium"
                              style={{ color: "var(--lp-label)" }}
                            >
                              <ShieldCheck className="h-4 w-4" aria-hidden />
                              图形验证码
                            </label>
                            <div className="grid grid-cols-[minmax(0,1fr)_132px] gap-2">
                              <Input
                                id="register-captcha"
                                type="text"
                                autoComplete="off"
                                placeholder="输入图中字符"
                                {...registerForm.register("captchaCode", {
                                  required: "请输入图形验证码",
                                  minLength: { value: 4, message: "验证码至少4个字符" },
                                })}
                                className={cn(
                                  inputBase,
                                  "h-[48px]",
                                  registerErrors.captchaCode && "login-soft-input--error",
                                )}
                                aria-invalid={registerErrors.captchaCode ? true : undefined}
                              />
                              <button
                                type="button"
                                onClick={() => void loadCaptcha("register")}
                                disabled={captchaLoading}
                                className="flex h-[48px] items-center justify-center overflow-hidden rounded-[15px] border border-white/15 bg-white/70 text-sm shadow-sm transition hover:bg-white/85 disabled:opacity-60 dark:bg-white/10 dark:hover:bg-white/15"
                                aria-label="刷新图形验证码"
                                title="点击刷新验证码"
                              >
                                {captchaLoading || !captcha ? (
                                  <RefreshCw className="h-4 w-4 animate-spin" aria-hidden />
                                ) : (
                                  <span
                                    className="flex h-full w-full items-center justify-center [&>svg]:h-full [&>svg]:w-full"
                                    dangerouslySetInnerHTML={{ __html: captcha.imageSvg }}
                                  />
                                )}
                              </button>
                            </div>
                            {registerErrors.captchaCode && (
                              <p className="text-xs font-medium text-red-500 dark:text-red-400">
                                {registerErrors.captchaCode.message}
                              </p>
                            )}
                          </div>

                          <div className="space-y-2">
                            <label
                              htmlFor="register-invite-code"
                              className="flex items-center gap-2 text-[13px] font-medium"
                              style={{ color: "var(--lp-label)" }}
                            >
                              <KeyRound className="h-4 w-4" aria-hidden />
                              邀请码
                            </label>
                            <Input
                              id="register-invite-code"
                              type="text"
                              autoComplete="off"
                              placeholder="请输入邀请码"
                              {...registerForm.register("inviteCode", {
                                required: "请输入邀请码",
                                validate: (value) => value.trim() === "0628" || "邀请码无效",
                              })}
                              className={cn(inputBase, registerErrors.inviteCode && "login-soft-input--error")}
                              aria-invalid={registerErrors.inviteCode ? true : undefined}
                            />
                            {registerErrors.inviteCode && (
                              <p className="text-xs font-medium text-red-500 dark:text-red-400">
                                {registerErrors.inviteCode.message}
                              </p>
                            )}
                          </div>

                          <label
                            className="flex cursor-pointer select-none items-start gap-3 text-[13px] leading-6"
                            style={{ color: "var(--lp-label)" }}
                          >
                            <input
                              type="checkbox"
                              checked={agreeTerms}
                              onChange={(e) => setAgreeTerms(e.target.checked)}
                              className="login-form-checkbox mt-1 h-[18px] w-[18px] cursor-pointer rounded-md transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--lp-checkbox-ring-offset)]"
                              aria-label="同意服务条款和隐私政策"
                            />
                            <span>
                              我同意{" "}
                              <button
                                type="button"
                                onClick={() => showTerms("terms")}
                                className="font-semibold text-cyan-200 underline-offset-4 hover:text-cyan-100 hover:underline"
                              >
                                服务条款
                              </button>{" "}
                              和{" "}
                              <button
                                type="button"
                                onClick={() => showTerms("privacy")}
                                className="font-semibold text-cyan-200 underline-offset-4 hover:text-cyan-100 hover:underline"
                              >
                                隐私政策
                              </button>
                            </span>
                          </label>
                        </div>

                        <div className="login-enter login-enter-delay-5 mt-7 flex flex-col gap-4">
                          <Button
                            type="submit"
                            variant="default"
                            disabled={loading || !agreeTerms}
                            aria-busy={loading}
                            className={cn(
                              "login-btn-shine login-submit-btn relative h-[54px] w-full overflow-hidden rounded-2xl border-0 px-4 text-[15px] font-semibold text-white !ring-0",
                              "transition-[transform,box-shadow,filter] duration-200 hover:enabled:-translate-y-0.5",
                              "active:enabled:translate-y-px active:enabled:brightness-[0.97] disabled:opacity-65 disabled:hover:translate-y-0",
                              loading && "login-submit-btn--busy",
                            )}
                          >
                            <span className="relative z-[1] inline-flex items-center justify-center gap-2">
                              {loading && <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />}
                              {loading ? "发送中..." : "发送验证码"}
                            </span>
                          </Button>
                          <p
                            className="text-center text-[13px] leading-6"
                            style={{ color: "var(--lp-card-muted)" }}
                          >
                            已有账号？{" "}
                            <Link
                              to="/login"
                              className="font-semibold text-cyan-200 underline-offset-4 transition hover:text-cyan-100 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/50"
                            >
                              立即登录
                            </Link>
                          </p>
                        </div>
                      </form>
                    )}

                    {activeMode === "code" && (
                      <form onSubmit={codeForm.handleSubmit(onConfirmCode)} noValidate>
                        <div className="login-enter login-enter-delay-4 space-y-5">
                          <div className="space-y-2">
                            <label
                              htmlFor="register-email-code"
                              className="flex items-center gap-2 text-[13px] font-medium"
                              style={{ color: "var(--lp-label)" }}
                            >
                              <Mail className="h-4 w-4" aria-hidden />
                              邮箱验证码
                            </label>
                            <Input
                              id="register-email-code"
                              type="text"
                              inputMode="numeric"
                              autoComplete="one-time-code"
                              maxLength={6}
                              placeholder="请输入 6 位邮箱验证码"
                              {...codeForm.register("code", {
                                required: "请输入邮箱验证码",
                                pattern: { value: /^\d{6}$/, message: "请输入 6 位数字验证码" },
                              })}
                              className={cn(inputBase, codeErrors.code && "login-soft-input--error")}
                              aria-invalid={codeErrors.code ? true : undefined}
                            />
                            {codeErrors.code && (
                              <p className="text-xs font-medium text-red-500 dark:text-red-400">
                                {codeErrors.code.message}
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="login-enter login-enter-delay-5 mt-7 flex flex-col gap-3">
                          <Button
                            type="submit"
                            disabled={loading}
                            className={cn(
                              "login-btn-shine login-submit-btn relative h-[54px] w-full overflow-hidden rounded-2xl border-0 px-4 text-[15px] font-semibold text-white !ring-0",
                              loading && "login-submit-btn--busy",
                            )}
                          >
                            <span className="relative z-[1] inline-flex items-center justify-center gap-2">
                              {loading && <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />}
                              {loading ? "验证中..." : "完成注册"}
                            </span>
                          </Button>
                          <div className="grid grid-cols-2 gap-2">
                            <Button
                              type="button"
                              variant="ghost"
                              disabled={loading}
                              onClick={() => void handleResend()}
                              className="h-11 rounded-xl text-cyan-100 hover:bg-white/10"
                            >
                              重发验证码
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              disabled={loading}
                              onClick={() => {
                                setRegisterStep("form");
                                setFormNotice(null);
                                codeForm.reset({ code: "" });
                              }}
                              className="h-11 rounded-xl text-cyan-100 hover:bg-white/10"
                            >
                              <ArrowLeft className="mr-1.5 h-4 w-4" aria-hidden />
                              返回修改
                            </Button>
                          </div>
                        </div>
                      </form>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
