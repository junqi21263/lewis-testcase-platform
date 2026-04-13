import { useState, useEffect } from 'react'

interface PasswordStrengthProps {
  password: string
  showStrength?: boolean
}

export function PasswordStrength({ password, showStrength = true }: PasswordStrengthProps) {
  const [strength, setStrength] = useState(0)
  const [strengthText, setStrengthText] = useState('')

  useEffect(() => {
    let score = 0

    // 长度检查
    if (password.length >= 8) score += 1
    if (password.length >= 12) score += 1

    // 字符类型检查
    if (/[a-z]/.test(password)) score += 1
    if (/[A-Z]/.test(password)) score += 1
    if (/[0-9]/.test(password)) score += 1
    if (/[^a-zA-Z0-9]/.test(password)) score += 1

    setStrength(score)

    // 设置强度文本
    if (score <= 2) {
      setStrengthText('弱')
    } else if (score <= 4) {
      setStrengthText('中等')
    } else {
      setStrengthText('强')
    }
  }, [password])

  const getStrengthColor = () => {
    if (strength <= 2) return 'text-red-500'
    if (strength <= 4) return 'text-yellow-500'
    return 'text-green-500'
  }

  const getStrengthBarColor = () => {
    if (strength <= 2) return 'bg-red-500'
    if (strength <= 4) return 'bg-yellow-500'
    return 'bg-green-500'
  }

  if (!showStrength) return null

  return (
    <div className="mt-2">
      <div className="flex items-center justify-between text-sm">
        <span className={`font-medium ${getStrengthColor()}`}>
          密码强度: {strengthText}
        </span>
        <span className="text-gray-500">{strength}/6</span>
      </div>
      <div className="mt-1 w-full bg-gray-200 rounded-full h-2">
        <div
          className={`h-2 rounded-full transition-all duration-300 ${getStrengthBarColor()}`}
          style={{ width: `${(strength / 6) * 100}%` }}
        />
      </div>
      <div className="mt-2 text-xs text-gray-500 space-y-1">
        <p>• 至少 6 个字符</p>
        <p>• 包含大小写字母</p>
        <p>• 包含数字</p>
        <p>• 包含特殊字符</p>
      </div>
    </div>
  )
}