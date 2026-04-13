/**
 * 与后端 `PASSWORD_CONFIG` / PasswordValidator 保持一致，避免表单放行但接口 400
 */
export function passwordPolicyErrors(password: string): string[] {
  const errors: string[] = []
  if (password.length < 6) {
    errors.push('密码至少需要 6 个字符')
  }
  if (!/[A-Z]/.test(password)) {
    errors.push('密码必须包含大写字母')
  }
  if (!/[a-z]/.test(password)) {
    errors.push('密码必须包含小写字母')
  }
  if (!/[0-9]/.test(password)) {
    errors.push('密码必须包含数字')
  }
  if (!/[^a-zA-Z0-9]/.test(password)) {
    errors.push('密码必须包含特殊字符')
  }
  return errors
}

export function passwordPolicyMessage(password: string): string | true {
  const errors = passwordPolicyErrors(password)
  if (errors.length === 0) return true
  return errors.join('；')
}
