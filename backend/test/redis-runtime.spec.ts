import { RedisService } from '@/redis/redis.service'

function serviceWithClient(client: Record<string, jest.Mock>) {
  const svc = new RedisService() as any
  svc.client = client
  return svc as RedisService
}

describe('Redis runtime helpers', () => {
  it('stores and reads stream chunks for interrupted AI streams', async () => {
    const list: string[] = []
    const client = {
      status: 'ready',
      rpush: jest.fn(async (_key: string, value: string) => list.push(value)),
      expire: jest.fn(),
      lrange: jest.fn(async () => list),
      del: jest.fn(),
    } as any
    const redis = serviceWithClient(client)

    await redis.appendStreamChunk('stream-1', 'hello ')
    await redis.appendStreamChunk('stream-1', 'world')
    const snapshot = await redis.getStreamSnapshot('stream-1')

    expect(snapshot).toBe('hello world')
    expect(client.expire).toHaveBeenCalled()
  })

  it('enqueues and dequeues lightweight redis jobs', async () => {
    const queue: string[] = []
    const client = {
      status: 'ready',
      lpush: jest.fn(async (_key: string, value: string) => queue.unshift(value)),
      rpop: jest.fn(async () => queue.pop() ?? null),
      expire: jest.fn(),
    } as any
    const redis = serviceWithClient(client)

    await redis.enqueueJob('file-parse', { fileId: 'file-1' })
    const job = await redis.dequeueJob<{ fileId: string }>('file-parse')

    expect(job?.fileId).toBe('file-1')
    expect(client.lpush).toHaveBeenCalledWith('queue:file-parse', JSON.stringify({ fileId: 'file-1' }))
  })

  it('merges realtime parse progress over database state', async () => {
    const client = {
      status: 'ready',
      setex: jest.fn(),
      get: jest.fn(async () => JSON.stringify({ parseStage: 'OCR', parseProgress: { pageCurrent: 2 } })),
    } as any
    const redis = serviceWithClient(client)

    await redis.setFileParseProgress('file-1', 'OCR', { pageCurrent: 2 })
    const merged = await redis.mergeFileParseRealtime('file-1', {
      status: 'PARSING',
      parseStage: 'PDF',
      parseProgress: null,
    })

    expect(merged).toEqual({
      status: 'PARSING',
      parseStage: 'OCR',
      parseProgress: { pageCurrent: 2 },
    })
  })
})
