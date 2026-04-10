export const PASSWORD_CONFIG = {
  minLength: 6,
  requireUppercase: true,
  requireLowercase: true,
  requireNumbers: true,
  requireSpecialChars: true,
  maxAttempts: 5,
  lockoutDuration: 30, // minutes
  resetTokenExpiry: '1h',
  verificationTokenExpiry: '24h',
} as const

export type PasswordConfig = typeof PASSWORD_CONFIG