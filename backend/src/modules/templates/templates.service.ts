import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common'
import { PrismaService } from '@/prisma/prisma.service'

type ListParams = { page?: number; pageSize?: number; category?: string; keyword?: string }

@Injectable()
export class TemplatesService {
  /** GET /templates 短期内存缓存（毫秒），TEMPLATES_LIST_CACHE_TTL_MS=0 关闭 */
  private readonly listCacheTtlMs = parseInt(process.env.TEMPLATES_LIST_CACHE_TTL_MS || '0', 10)
  private readonly listCache = new Map<string, { expires: number; payload: { list: unknown[]; total: number; page: number; pageSize: number } }>()

  constructor(private prisma: PrismaService) {}

  private listCacheKey(userId: string, params: ListParams): string {
    return `${userId}:${JSON.stringify(params)}`
  }

  private invalidateAllListCache() {
    this.listCache.clear()
  }

  async getTemplates(userId: string, params: ListParams) {
    const ttl = this.listCacheTtlMs
    if (ttl > 0) {
      const key = this.listCacheKey(userId, params)
      const hit = this.listCache.get(key)
      if (hit && hit.expires > Date.now()) {
        return hit.payload
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
      const key = this.listCacheKey(userId, params)
      this.listCache.set(key, { expires: Date.now() + ttl, payload })
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
    this.invalidateAllListCache()
    return created
  }

  async update(id: string, userId: string, data: any, role?: string) {
    const tpl = await this.prisma.promptTemplate.findUnique({ where: { id } })
    if (!tpl) throw new NotFoundException('模板不存在')
    const isOwner = tpl.creatorId === userId
    const isSuper = role === 'SUPER_ADMIN'
    if (!isOwner && !isSuper) throw new ForbiddenException('无权修改该模板')
    const updated = await this.prisma.promptTemplate.update({ where: { id }, data })
    this.invalidateAllListCache()
    return updated
  }

  async delete(id: string, userId: string, role?: string) {
    const tpl = await this.prisma.promptTemplate.findUnique({ where: { id } })
    if (!tpl) throw new NotFoundException('模板不存在')
    const isOwner = tpl.creatorId === userId
    const isSuper = role === 'SUPER_ADMIN'
    if (!isOwner && !isSuper) throw new ForbiddenException('无权删除该模板')
    await this.prisma.promptTemplate.delete({ where: { id } })
    this.invalidateAllListCache()
  }
}
