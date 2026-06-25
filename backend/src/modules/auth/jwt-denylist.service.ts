import { Injectable, Optional, UnauthorizedException } from '@nestjs/common'
import { RedisService } from '@/redis/redis.service'

const DEFAULT_LOGOUT_TTL_SEC = 24 * 60 * 60

@Injectable()
export class JwtDenylistService {
  private readonly localRevoked = new Map<string, number>()

  constructor(@Optional() private readonly redis?: RedisService) {}

  private key(token: string) {
    return `auth:jwt:denylist:${token}`
  }

  private pruneLocal(now = Date.now()) {
    for (const [token, expiresAt] of this.localRevoked.entries()) {
      if (expiresAt <= now) this.localRevoked.delete(token)
    }
  }

  async revoke(token: string | null | undefined, exp?: number | null): Promise<void> {
    const clean = token?.trim()
    if (!clean) return
    const nowSec = Math.floor(Date.now() / 1000)
    const ttlSec = exp && exp > nowSec ? exp - nowSec : DEFAULT_LOGOUT_TTL_SEC
    if (this.redis?.isReady()) {
      await this.redis.setEntry(this.key(clean), '1', ttlSec)
      return
    }
    this.pruneLocal()
    this.localRevoked.set(clean, Date.now() + ttlSec * 1000)
  }

  async isRevoked(token: string | null | undefined): Promise<boolean> {
    const clean = token?.trim()
    if (!clean) return false
    if (this.redis?.isReady()) {
      return (await this.redis.getEntry(this.key(clean))) === '1'
    }
    this.pruneLocal()
    return this.localRevoked.has(clean)
  }

  async assertNotRevoked(token: string | null | undefined): Promise<void> {
    if (await this.isRevoked(token)) {
      throw new UnauthorizedException('登录状态已失效，请重新登录')
    }
  }
}
