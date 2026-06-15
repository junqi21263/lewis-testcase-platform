import type { ConfigService } from '@nestjs/config'
import { getJwtExpiresIn, getJwtSecret } from '../src/modules/auth/jwt-config.util'

function config(values: Record<string, string | undefined>): ConfigService {
  return {
    get: (key: string) => values[key],
  } as unknown as ConfigService
}

describe('jwt-config.util', () => {
  it('returns a non-empty development fallback when JWT_SECRET is missing', () => {
    expect(getJwtSecret(config({ JWT_SECRET: '' }))).toBe('dev-only-change-me')
    expect(getJwtSecret(config({}))).toBe('dev-only-change-me')
  })

  it('trims configured JWT_SECRET', () => {
    expect(getJwtSecret(config({ JWT_SECRET: '  real-secret  ' }))).toBe('real-secret')
  })

  it('uses configured JWT_EXPIRES_IN or defaults to seven days', () => {
    expect(getJwtExpiresIn(config({ JWT_EXPIRES_IN: '  2h  ' }))).toBe('2h')
    expect(getJwtExpiresIn(config({}))).toBe('7d')
  })
})
