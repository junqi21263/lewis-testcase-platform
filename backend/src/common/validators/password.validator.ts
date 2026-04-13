import { Injectable } from '@nestjs/common'
import { PASSWORD_CONFIG } from '@/config/password.config'

@Injectable()
export class PasswordValidator {
  private readonly config = PASSWORD_CONFIG

  get verificationTokenExpiry(): string {
    return this.config.verificationTokenExpiry
  }

  validate(password: string): { valid: boolean; errors: string[] } {
    const errors: string[] = []

    if (password.length < this.config.minLength) {
      errors.push(`密码至少需要 ${this.config.minLength} 个字符`)
    }

    if (this.config.requireUppercase && !/[A-Z]/.test(password)) {
      errors.push('密码必须包含大写字母')
    }

    if (this.config.requireLowercase && !/[a-z]/.test(password)) {
      errors.push('密码必须包含小写字母')
    }

    if (this.config.requireNumbers && !/[0-9]/.test(password)) {
      errors.push('密码必须包含数字')
    }

    if (this.config.requireSpecialChars && !/[^a-zA-Z0-9]/.test(password)) {
      errors.push('密码必须包含特殊字符')
    }

    return {
      valid: errors.length === 0,
      errors,
    }
  }

  getStrength(password: string): number {
    let strength = 0

    if (password.length >= this.config.minLength) strength += 1
    if (password.length >= this.config.minLength * 2) strength += 1

    if (/[a-z]/.test(password)) strength += 1
    if (/[A-Z]/.test(password)) strength += 1
    if (/[0-9]/.test(password)) strength += 1
    if (/[^a-zA-Z0-9]/.test(password)) strength += 1

    return strength
  }
}
