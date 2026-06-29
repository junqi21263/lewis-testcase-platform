import { TemplatesService } from '@/modules/templates/templates.service'

describe('TemplatesService list cache', () => {
  const templateRows = [
    {
      id: 'tpl-1',
      creatorId: 'u-1',
      name: '标准结构化报告',
      isPublic: false,
      category: 'GENERAL',
      content: 'template body',
      version: 1,
      usageCount: 3,
      creator: { id: 'u-1', username: 'tester' },
    },
  ]

  const originalTtl = process.env.TEMPLATES_LIST_CACHE_TTL_MS

  beforeEach(() => {
    process.env.TEMPLATES_LIST_CACHE_TTL_MS = '30000'
  })

  afterEach(() => {
    if (originalTtl === undefined) delete process.env.TEMPLATES_LIST_CACHE_TTL_MS
    else process.env.TEMPLATES_LIST_CACHE_TTL_MS = originalTtl
    jest.restoreAllMocks()
  })

  function createService(options?: {
    redisReady?: boolean
    redisEntry?: string | null
  }) {
    const prisma = {
      promptTemplate: {
        findMany: jest.fn(async () => templateRows),
        count: jest.fn(async () => templateRows.length),
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
          id: 'tpl-created',
          ...data,
        })),
      },
    }
    const redis = {
      isReady: jest.fn(() => options?.redisReady ?? false),
      getListGen: jest.fn(async () => 7),
      incrListGen: jest.fn(async () => undefined),
      getEntry: jest.fn(async () => options?.redisEntry ?? null),
      setEntry: jest.fn(async () => undefined),
    }
    const service = new TemplatesService(prisma as any, redis as any, {} as any, {} as any)
    return { service, prisma, redis }
  }

  it('uses Redis list cache when generation matches and avoids hitting Prisma twice', async () => {
    const cachedPayload = { list: templateRows, total: 1, page: 1, pageSize: 20 }
    const { service, prisma, redis } = createService({
      redisReady: true,
      redisEntry: JSON.stringify({ g: 7, p: cachedPayload }),
    })

    const first = await service.getTemplates('u-1', { page: 1, pageSize: 20 })
    const second = await service.getTemplates('u-1', { page: 1, pageSize: 20 })

    expect(first).toEqual(cachedPayload)
    expect(second).toEqual(cachedPayload)
    expect(prisma.promptTemplate.findMany).not.toHaveBeenCalled()
    expect(prisma.promptTemplate.count).not.toHaveBeenCalled()
    expect(redis.getEntry).toHaveBeenCalledTimes(2)
    expect(redis.setEntry).not.toHaveBeenCalled()
  })

  it('falls back to in-process memory cache when Redis is unavailable', async () => {
    const { service, prisma, redis } = createService({ redisReady: false })

    const first = await service.getTemplates('u-1', { page: 1, pageSize: 20 })
    const second = await service.getTemplates('u-1', { page: 1, pageSize: 20 })

    expect(first.list).toHaveLength(1)
    expect(second.list).toHaveLength(1)
    expect(prisma.promptTemplate.findMany).toHaveBeenCalledTimes(1)
    expect(prisma.promptTemplate.count).toHaveBeenCalledTimes(1)
    expect(redis.getEntry).not.toHaveBeenCalled()
  })

  it('invalidates cache generation after template creation', async () => {
    const { service, redis } = createService({ redisReady: true })

    await service.create('u-1', {
      name: '新增模板',
      description: 'desc',
      category: 'GENERAL' as any,
      content: 'body',
      isPublic: false,
      variables: [],
    })

    expect(redis.incrListGen).toHaveBeenCalledTimes(1)
  })
})
