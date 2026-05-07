import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common'
import { createHash } from 'crypto'
import { PrismaService } from '@/prisma/prisma.service'
import { RedisService } from '@/redis/redis.service'

type ListParams = { page?: number; pageSize?: number; category?: string; keyword?: string }

@Injectable()
export class TemplatesService {
  /** GET /templates 短期内存缓存（毫秒）。未设置或空：生产默认 30s，非生产默认关闭；显式 0=关闭 */
  private readonly listCacheTtlMs = TemplatesService.resolveListCacheTtlMs()
  private readonly listCache = new Map<string, { expires: number; payload: { list: unknown[]; total: number; page: number; pageSize: number } }>()

  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
  ) {}

  private static resolveListCacheTtlMs(): number {
    const raw = process.env.TEMPLATES_LIST_CACHE_TTL_MS?.trim()
    if (raw !== undefined && raw !== '') {
      const n = parseInt(raw, 10)
      return Number.isFinite(n) && n >= 0 ? n : 0
    }
    return process.env.NODE_ENV === 'production' ? 30_000 : 0
  }

  private listCacheKey(userId: string, params: ListParams): string {
    return `${userId}:${JSON.stringify(params)}`
  }

  private redisListKey(userId: string, params: ListParams): string {
    const h = createHash('sha256').update(`${userId}\0${JSON.stringify(params)}`, 'utf8').digest('hex')
    return `tpl:list:c:${h}`
  }

  private useRedisListCache(): boolean {
    return this.listCacheTtlMs > 0 && this.redis.isReady()
  }

  private async invalidateAllListCache() {
    this.listCache.clear()
    if (this.useRedisListCache()) {
      await this.redis.incrListGen()
    }
  }

  async getTemplates(userId: string, params: ListParams) {
    const ttl = this.listCacheTtlMs
    if (ttl > 0) {
      if (this.useRedisListCache()) {
        const gen = await this.redis.getListGen()
        const rk = this.redisListKey(userId, params)
        const raw = await this.redis.getEntry(rk)
        if (raw) {
          try {
            const parsed = JSON.parse(raw) as { g: number; p: { list: unknown[]; total: number; page: number; pageSize: number } }
            if (parsed && typeof parsed.g === 'number' && parsed.g === gen) {
              return parsed.p
            }
          } catch {
            /* miss */
          }
        }
      } else {
        const key = this.listCacheKey(userId, params)
        const hit = this.listCache.get(key)
        if (hit && hit.expires > Date.now()) {
          return hit.payload
        }
      }
    }

    const { page = 1, pageSize = 20, category, keyword } = params
    const where = {
      OR: [{ creatorId: userId }, { isPublic: true }],
      ...(category ? { category: category as any } : {}),
      ...(keyword ? { name: { contains: keyword, mode: 'insensitive' as const } } : {}),
    }
    const [list, total] = await Promise.all([
      this.prisma.promptTemplate.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { usageCount: 'desc' },
        include: { creator: { select: { id: true, username: true } } },
      }),
      this.prisma.promptTemplate.count({ where }),
    ])
    const payload = { list, total, page, pageSize }
    if (ttl > 0) {
      if (this.useRedisListCache()) {
        const gen = await this.redis.getListGen()
        const rk = this.redisListKey(userId, params)
        const body = JSON.stringify({ g: gen, p: payload })
        await this.redis.setEntry(rk, body, ttl / 1000)
      } else {
        const key = this.listCacheKey(userId, params)
        this.listCache.set(key, { expires: Date.now() + ttl, payload })
      }
    }
    return payload
  }

  async getById(id: string) {
    const tpl = await this.prisma.promptTemplate.findUnique({ where: { id } })
    if (!tpl) throw new NotFoundException('模板不存在')
    return tpl
  }

  async create(userId: string, data: any) {
    const created = await this.prisma.promptTemplate.create({
      data: { ...data, creatorId: userId, variables: data.variables || [] },
    })
    await this.invalidateAllListCache()
    return created
  }

  async update(id: string, userId: string, data: any, role?: string) {
    const tpl = await this.prisma.promptTemplate.findUnique({ where: { id } })
    if (!tpl) throw new NotFoundException('模板不存在')
    const isOwner = tpl.creatorId === userId
    const isSuper = role === 'SUPER_ADMIN'
    if (!isOwner && !isSuper) throw new ForbiddenException('无权修改该模板')
    const updated = await this.prisma.promptTemplate.update({ where: { id }, data })
    await this.invalidateAllListCache()
    return updated
  }

  async delete(id: string, userId: string, role?: string) {
    const tpl = await this.prisma.promptTemplate.findUnique({ where: { id } })
    if (!tpl) throw new NotFoundException('模板不存在')
    const isOwner = tpl.creatorId === userId
    const isSuper = role === 'SUPER_ADMIN'
    if (!isOwner && !isSuper) throw new ForbiddenException('无权删除该模板')
    await this.prisma.promptTemplate.delete({ where: { id } })
    await this.invalidateAllListCache()
  }
}
