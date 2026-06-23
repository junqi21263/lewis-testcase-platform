import { Injectable, Optional } from '@nestjs/common'
import type { Response } from 'express'
import { RedisService } from '@/redis/redis.service'

@Injectable()
export class AiStreamRecoveryService {
  constructor(@Optional() private readonly redis?: RedisService) {}

  private canWrite(res: Response): boolean {
    return !res.destroyed && !res.writableEnded
  }

  writeRaw(res: Response, payload: string): boolean {
    if (!this.canWrite(res)) return false
    try {
      res.write(payload)
      ;(res as Response & { flush?: () => void }).flush?.()
      return true
    } catch {
      return false
    }
  }

  writeData(res: Response, payload: unknown): boolean {
    return this.writeRaw(res, `data: ${JSON.stringify(payload)}\n\n`)
  }

  writeDone(res: Response): boolean {
    return this.writeRaw(res, 'data: [DONE]\n\n')
  }

  end(res: Response): void {
    if (res.destroyed || res.writableEnded) return
    try {
      res.end()
    } catch {
      /* client already disconnected */
    }
  }

  async writeSseContent(res: Response, streamId: string, delta: string): Promise<void> {
    if (!delta) return
    await this.redis?.appendStreamChunk(streamId, delta)
    this.writeData(res, { content: delta })
  }

  append(streamId: string, delta: string): Promise<void> {
    return this.redis?.appendStreamChunk(streamId, delta) ?? Promise.resolve()
  }

  snapshot(streamId: string): Promise<string> {
    return this.redis?.getStreamSnapshot(streamId) ?? Promise.resolve('')
  }

  clear(streamId: string): Promise<void> {
    return this.redis?.clearStreamSnapshot(streamId) ?? Promise.resolve()
  }
}
