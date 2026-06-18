import { CheckCircle2, Circle } from 'lucide-react'

interface PasswordStrengthProps {
  password: string
  showStrength?: boolean
}

export function PasswordStrength({ password, showStrength = true }: PasswordStrengthProps) {
  if (!showStrength) return null

  const rules = [
    { id: 'length', label: '至少 6 个字符', valid: password.length >= 6 },
    { id: 'uppercase', label: '包含大写字母', valid: /[A-Z]/.test(password) },
    { id: 'lowercase', label: '包含小写字母', valid: /[a-z]/.test(password) },
    { id: 'number', label: '包含数字', valid: /\d/.test(password) },
    { id: 'symbol', label: '包含特殊字符', valid: /[^a-zA-Z0-9]/.test(password) },
  ]

  const passed = rules.filter((rule) => rule.valid).length
  const strengthText = passed >= 5 ? '强' : passed >= 3 ? '中等' : '弱'
  const strengthClass =
    passed >= 5
      ? 'text-emerald-700 dark:text-emerald-300'
      : passed >= 3
        ? 'text-amber-700 dark:text-amber-300'
        : 'text-rose-700 dark:text-rose-300'
  const barClass =
    passed >= 5 ? 'bg-emerald-400' : passed >= 3 ? 'bg-amber-300' : 'bg-rose-400'

  return (
    <div className="mt-3 rounded-2xl border border-slate-200/80 bg-white/65 p-3 shadow-inner dark:border-white/10 dark:bg-white/[0.055]">
      <div className="flex items-center justify-between text-xs">
        <span data-testid="password-strength-label" className={`font-semibold ${strengthClass}`}>
          密码强度：{strengthText}
        </span>
        <span className="text-slate-500 dark:text-white/50">{passed}/5</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200/80 dark:bg-white/12">
        <div
          className={`h-full rounded-full transition-all duration-300 ${barClass}`}
          style={{ width: `${Math.max((passed / rules.length) * 100, 8)}%` }}
        />
      </div>
      <div className="mt-3 grid grid-cols-1 gap-1.5 text-xs sm:grid-cols-2">
        {rules.map((rule) => (
          <div
            key={rule.id}
            data-testid={`password-rule-${rule.id}`}
            data-valid={String(rule.valid)}
            className={`flex items-center gap-1.5 transition-colors ${
              rule.valid ? 'text-emerald-700 dark:text-emerald-200' : 'text-slate-500 dark:text-white/45'
            }`}
          >
            {rule.valid ? (
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
            ) : (
              <Circle className="h-3.5 w-3.5 shrink-0" aria-hidden />
            )}
            <span>{rule.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
