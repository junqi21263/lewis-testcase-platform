import { Injectable, Optional } from '@nestjs/common'
import type { Response } from 'express'
import { RedisService } from '@/redis/redis.service'

@Injectable()
export class AiStreamRecoveryService {
  constructor(@Optional() private readonly redis?: RedisService) {}

  async writeSseContent(res: Response, streamId: string, delta: string): Promise<void> {
    if (!delta) return
    await this.redis?.appendStreamChunk(streamId, delta)
    res.write(`data: ${JSON.stringify({ content: delta })}\n\n`)
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
