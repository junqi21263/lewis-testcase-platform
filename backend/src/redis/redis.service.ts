import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import Redis from 'ioredis'

const GEN_KEY = 'tpl:list:gen'
const DEFAULT_STREAM_TTL_SEC = 60 * 60
const DEFAULT_QUEUE_TTL_SEC = 24 * 60 * 60
const DEFAULT_PARSE_PROGRESS_TTL_SEC = 2 * 60 * 60

type FileParseRealtime = {
  parseStage?: string | null
  parseProgress?: unknown
  updatedAt?: string
}

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name)
  private client: Redis | null = null

  async onModuleInit() {
    const url = process.env.REDIS_URL?.trim()
    const disabled = ['0', 'false', 'off'].includes((process.env.REDIS_ENABLED || '').trim().toLowerCase())
    if (!url || disabled) {
      this.logger.log('Redis backend off (set REDIS_URL and keep REDIS_ENABLED!=0 to enable cache/queue/realtime state).')
      return
    }
    try {
      const c = new Redis(url, { maxRetriesPerRequest: 2, connectTimeout: 8000 })
      await c.ping()
      this.client = c
      this.logger.log('Redis: connected; cache/queue/realtime state enabled.')
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      this.logger.warn(`Redis connect failed (${msg}); template list cache uses in-process only.`)
      this.client?.disconnect()
      this.client = null
    }
  }

  async onModuleDestroy() {
    if (this.client) {
      await this.client.quit()
      this.client = null
    }
  }

  /** Redis selected for template list + wired and connected */
  isReady(): boolean {
    return this.client !== null && this.client.status === 'ready'
  }

  async getListGen(): Promise<number> {
    if (!this.client) return 0
    try {
      const v = await this.client.get(GEN_KEY)
      return v === null || v === undefined ? 0 : Number(v) || 0
    } catch {
      return 0
    }
  }

  async incrListGen(): Promise<void> {
    if (!this.client) return
    try {
      await this.client.incr(GEN_KEY)
    } catch {
      /* fall through */
    }
  }

  async getEntry(key: string): Promise<string | null> {
    if (!this.client) return null
    try {
      return await this.client.get(key)
    } catch {
      return null
    }
  }

  async setEntry(key: string, value: string, ttlSec: number): Promise<void> {
    if (!this.client) return
    try {
      const sec = Math.max(1, Math.ceil(ttlSec))
      await this.client.setex(key, sec, value)
    } catch {
      /* fall through */
    }
  }

  async delEntry(key: string): Promise<void> {
    if (!this.client) return
    try {
      await this.client.del(key)
    } catch {
      /* fall through */
    }
  }

  private streamKey(streamId: string): string {
    return `stream:${streamId}:chunks`
  }

  async appendStreamChunk(streamId: string, chunk: string, ttlSec = DEFAULT_STREAM_TTL_SEC): Promise<void> {
    if (!this.client || !chunk) return
    const key = this.streamKey(streamId)
    try {
      await this.client.rpush(key, chunk)
      await this.client.expire(key, Math.max(1, Math.ceil(ttlSec)))
    } catch {
      /* fall through */
    }
  }

  async getStreamSnapshot(streamId: string): Promise<string> {
    if (!this.client) return ''
    try {
      const chunks = await this.client.lrange(this.streamKey(streamId), 0, -1)
      return chunks.join('')
    } catch {
      return ''
    }
  }

  async clearStreamSnapshot(streamId: string): Promise<void> {
    await this.delEntry(this.streamKey(streamId))
  }

  private queueKey(queueName: string): string {
    return `queue:${queueName}`
  }

  async enqueueJob<T extends object>(queueName: string, payload: T, ttlSec = DEFAULT_QUEUE_TTL_SEC): Promise<void> {
    if (!this.client) return
    const key = this.queueKey(queueName)
    try {
      await this.client.lpush(key, JSON.stringify(payload))
      await this.client.expire(key, Math.max(1, Math.ceil(ttlSec)))
    } catch {
      /* fall through */
    }
  }

  async dequeueJob<T extends object>(queueName: string): Promise<T | null> {
    if (!this.client) return null
    try {
      const raw = await this.client.rpop(this.queueKey(queueName))
      if (!raw) return null
      return JSON.parse(raw) as T
    } catch {
      return null
    }
  }

  async queueLength(queueName: string): Promise<number> {
    if (!this.client) return 0
    try {
      return await this.client.llen(this.queueKey(queueName))
    } catch {
      return 0
    }
  }

  private fileParseProgressKey(fileId: string): string {
    return `file:parse:progress:${fileId}`
  }

  async setFileParseProgress(
    fileId: string,
    parseStage: string,
    parseProgress?: unknown,
    ttlSec = DEFAULT_PARSE_PROGRESS_TTL_SEC,
  ): Promise<void> {
    const payload: FileParseRealtime = {
      parseStage,
      parseProgress: parseProgress ?? null,
      updatedAt: new Date().toISOString(),
    }
    await this.setEntry(this.fileParseProgressKey(fileId), JSON.stringify(payload), ttlSec)
  }

  async getFileParseProgress(fileId: string): Promise<FileParseRealtime | null> {
    const raw = await this.getEntry(this.fileParseProgressKey(fileId))
    if (!raw) return null
    try {
      return JSON.parse(raw) as FileParseRealtime
    } catch {
      return null
    }
  }

  async clearFileParseProgress(fileId: string): Promise<void> {
    await this.delEntry(this.fileParseProgressKey(fileId))
  }

  async mergeFileParseRealtime<T extends { parseStage?: string | null; parseProgress?: unknown; status?: unknown }>(
    fileId: string,
    dbPayload: T,
  ): Promise<T> {
    const realtime = await this.getFileParseProgress(fileId)
    if (!realtime) return dbPayload
    return {
      ...dbPayload,
      parseStage: realtime.parseStage ?? dbPayload.parseStage,
      parseProgress:
        realtime.parseProgress === undefined || realtime.parseProgress === null
          ? dbPayload.parseProgress
          : realtime.parseProgress,
    }
  }
}
