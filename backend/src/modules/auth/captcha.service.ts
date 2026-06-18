import { Injectable, Optional } from '@nestjs/common'
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto'
import * as svgCaptcha from 'svg-captcha'
import { RedisService } from '@/redis/redis.service'

export type CaptchaAction = 'login' | 'register' | 'reset'

type CaptchaEntry = {
  hash: string
  expiresAt: number
}

const DEFAULT_CAPTCHA_TTL_SEC = 5 * 60

@Injectable()
export class CaptchaService {
  private readonly memory = new Map<string, CaptchaEntry>()

  constructor(@Optional() private readonly redis?: RedisService) {}

  normalizeAction(action?: string | null): CaptchaAction {
    if (action === 'register' || action === 'reset') return action
    return 'login'
  }

  async create(actionRaw?: string | null) {
    const action = this.normalizeAction(actionRaw)
    const captcha = svgCaptcha.create({
      size: 4,
      ignoreChars: '0oO1ilI',
      noise: 2,
      color: true,
      background: '#f8fafc',
      width: 132,
      height: 44,
      fontSize: 44,
    })
    const captchaId = randomUUID()
    const ttlSec = this.ttlSec()
    const entry: CaptchaEntry = {
      hash: this.hash(captcha.text),
      expiresAt: Date.now() + ttlSec * 1000,
    }
    await this.store(action, captchaId, entry, ttlSec)
    return {
      captchaId,
      imageSvg: captcha.data,
      expiresInSec: ttlSec,
    }
  }

  async validateAndConsume(actionRaw: string, captchaId?: string | null, captchaCode?: string | null): Promise<boolean> {
    const action = this.normalizeAction(actionRaw)
    const id = (captchaId ?? '').trim()
    const code = (captchaCode ?? '').trim()
    if (!id || !code) return false

    const key = this.key(action, id)
    const entry = await this.read(action, id)
    await this.delete(key)
    if (!entry || entry.expiresAt < Date.now()) return false
    return this.safeEqual(entry.hash, this.hash(code))
  }

  private ttlSec(): number {
    const raw = parseInt(process.env.AUTH_CAPTCHA_TTL_SEC || `${DEFAULT_CAPTCHA_TTL_SEC}`, 10)
    return Math.min(30 * 60, Math.max(60, raw || DEFAULT_CAPTCHA_TTL_SEC))
  }

  private key(action: CaptchaAction, id: string): string {
    return `auth:captcha:${action}:${id}`
  }

  private hash(value: string): string {
    return createHash('sha256').update(value.trim().toLowerCase()).digest('hex')
  }

  private safeEqual(left: string, right: string): boolean {
    const a = Buffer.from(left)
    const b = Buffer.from(right)
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  }

  private async store(action: CaptchaAction, id: string, entry: CaptchaEntry, ttlSec: number) {
    const key = this.key(action, id)
    if (this.redis?.isReady()) {
      await this.redis.setEntry(key, JSON.stringify(entry), ttlSec)
      return
    }
    this.sweepExpiredMemory()
    this.memory.set(key, entry)
  }

  private async read(action: CaptchaAction, id: string): Promise<CaptchaEntry | null> {
    const key = this.key(action, id)
    if (this.redis?.isReady()) {
      const raw = await this.redis.getEntry(key)
      if (!raw) return null
      try {
        return JSON.parse(raw) as CaptchaEntry
      } catch {
        return null
      }
    }
    return this.memory.get(key) ?? null
  }

  private async delete(key: string) {
    if (this.redis?.isReady()) {
      await this.redis.delEntry(key)
      return
    }
    this.memory.delete(key)
  }

  private sweepExpiredMemory() {
    const now = Date.now()
    for (const [key, entry] of this.memory.entries()) {
      if (entry.expiresAt < now) this.memory.delete(key)
    }
  }
}
