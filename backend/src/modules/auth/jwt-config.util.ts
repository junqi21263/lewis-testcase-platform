import type { JwtSignOptions } from '@nestjs/jwt'
import type { ConfigService } from '@nestjs/config'

const DEFAULT_JWT_SECRET = 'dev-only-change-me'
const DEFAULT_JWT_EXPIRES_IN = '7d'

export function getJwtSecret(config: ConfigService): string {
  return config.get<string>('JWT_SECRET')?.trim() || DEFAULT_JWT_SECRET
}

export function getJwtExpiresIn(config: ConfigService): JwtSignOptions['expiresIn'] {
  return (config.get<string>('JWT_EXPIRES_IN')?.trim() || DEFAULT_JWT_EXPIRES_IN) as JwtSignOptions['expiresIn']
}
