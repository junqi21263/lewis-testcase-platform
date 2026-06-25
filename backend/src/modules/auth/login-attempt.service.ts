import { HttpException, HttpStatus, Injectable, Optional } from '@nestjs/common'
import { createHash } from 'node:crypto'
import { RedisService } from '@/redis/redis.service'
import { PASSWORD_CONFIG } from '@/config/password.config'

type AttemptState = {
  count: number
  lockedUntil?: number
}

const FALLBACK_TTL_SEC = 60 * 60

@Injectable()
export class LoginAttemptService {
  private readonly local = new Map<string, { state: AttemptState; expiresAt: number }>()

  constructor(@Optional() private readonly redis?: RedisService) {}

  private hash(value: string) {
    return createHash('sha256').update(value.trim().toLowerCase()).digest('hex')
  }

  private key(login: string, ip?: string | null) {
    return `auth:login-attempt:${this.hash(`${login}|${ip || 'unknown'}`)}`
  }

  private prune(now = Date.now()) {
    for (const [key, item] of this.local.entries()) {
      if (item.expiresAt <= now) this.local.delete(key)
    }
  }

  private async read(key: string): Promise<AttemptState> {
    const raw = await this.redis?.getEntry(key)
    if (raw) {
      try {
        return JSON.parse(raw) as AttemptState
      } catch {
        return { count: 0 }
      }
    }
    this.prune()
    return this.local.get(key)?.state ?? { count: 0 }
  }

  private async write(key: string, state: AttemptState, ttlSec = FALLBACK_TTL_SEC): Promise<void> {
    if (this.redis?.isReady()) {
      await this.redis.setEntry(key, JSON.stringify(state), ttlSec)
      return
    }
    this.prune()
    this.local.set(key, { state, expiresAt: Date.now() + ttlSec * 1000 })
  }

  async assertAllowed(login: string, ip?: string | null): Promise<void> {
    const key = this.key(login, ip)
    const state = await this.read(key)
    const now = Date.now()
    if (state.lockedUntil && state.lockedUntil > now) {
      const seconds = Math.ceil((state.lockedUntil - now) / 1000)
      throw new HttpException(`登录失败次数过多，请 ${seconds} 秒后再试`, HttpStatus.TOO_MANY_REQUESTS)
    }
    if (state.lockedUntil && state.lockedUntil <= now) {
      await this.clear(login, ip)
    }
  }

  async recordFailure(login: string, ip?: string | null): Promise<void> {
    const key = this.key(login, ip)
    const state = await this.read(key)
    const nextCount = (state.count || 0) + 1
    const maxAttempts = PASSWORD_CONFIG.maxAttempts
    const lockoutMs = PASSWORD_CONFIG.lockoutDuration * 60 * 1000
    const lockedUntil = nextCount >= maxAttempts ? Date.now() + lockoutMs : state.lockedUntil
    await this.write(
      key,
      { count: nextCount, lockedUntil },
      Math.max(FALLBACK_TTL_SEC, Math.ceil(lockoutMs / 1000)),
    )
  }

  async clear(login: string, ip?: string | null): Promise<void> {
    const key = this.key(login, ip)
    if (this.redis?.isReady()) {
      await this.redis.delEntry(key)
      return
    }
    this.local.delete(key)
  }
}
