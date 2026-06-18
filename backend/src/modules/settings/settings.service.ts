import { Injectable, NotFoundException, BadRequestException, ConflictException, Optional } from '@nestjs/common'
import { AIModelConfig, Prisma } from '@prisma/client'
import { PrismaService } from '@/prisma/prisma.service'
import { CreateAiModelSettingsDto, UpdateAiModelSettingsDto } from './dto/ai-model-settings.dto'
import { MultimodalService } from '@/modules/multimodal/multimodal.service'
import { DEFAULT_OUTPUT_TOKENS } from '@/modules/ai/ai-output-budget.util'
import { RedisService } from '@/redis/redis.service'
import { ADMIN_AUDIT_ACTION } from '@/modules/admin/admin.constants'

function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, '')
}

type SettingsAuditTargetType = 'AI_MODEL' | 'SETTINGS'

@Injectable()
export class SettingsService {
  constructor(
    private prisma: PrismaService,
    private readonly multimodal: MultimodalService,
    @Optional() private readonly redis?: RedisService,
  ) {}

  private mapToAdminView(r: AIModelConfig) {
    return {
      id: r.id,
      name: r.name,
      provider: r.provider,
      modelId: r.modelId,
      baseUrl: r.baseUrl,
      maxTokens: r.maxTokens,
      temperature: r.temperature,
      isDefault: r.isDefault,
      isActive: r.isActive,
      supportsVision: r.supportsVision,
      useForDocumentVisionParse: r.useForDocumentVisionParse,
      hasApiKey: !!(r.apiKey && r.apiKey.length > 0 && r.apiKey !== 'placeholder'),
      lastTestAt: r.lastTestAt,
      lastTestOk: r.lastTestOk,
      lastTestLatencyMs: r.lastTestLatencyMs,
      lastTestError: r.lastTestError,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }
  }

  async getRuntimeHints() {
    const raw = parseInt(process.env.MAX_FILE_SIZE || '10485760', 10)
    const maxUploadMb = Math.max(1, Math.floor(raw / 1024 / 1024))
    const queueNames = ['file-parse', 'ai-analysis', 'ai-generate', 'ai-cross-review']
    const queues = await Promise.all(
      queueNames.map(async (name) => ({
        name,
        pending: await this.redisQueueLengthSafe(name),
      })),
    )
    return {
      maxUploadMb,
      maxFileSizeBytes: raw,
      throttleTtlSec: parseInt(process.env.THROTTLE_TTL || '60', 10),
      throttleLimit: parseInt(process.env.THROTTLE_LIMIT || '100', 10),
      visionPdfMinTextChars: parseInt(process.env.VISION_PDF_MIN_TEXT_CHARS || '120', 10),
      visionPdfAlways: process.env.VISION_PDF_ALWAYS === '1',
      redis: {
        ready: this.redis?.isReady() ?? false,
        enabled: Boolean(process.env.REDIS_URL?.trim()) && process.env.REDIS_ENABLED !== '0',
        urlConfigured: Boolean(process.env.REDIS_URL?.trim()),
      },
      queues,
      workers: {
        fileParseEnabled: process.env.FILE_PARSE_WORKER_ENABLED !== '0',
        fileParseMaxConcurrent: parseInt(process.env.FILE_PARSE_WORKER_MAX_CONCURRENT || '3', 10),
        fileParseIntervalMs: parseInt(process.env.FILE_PARSE_WORKER_INTERVAL_MS || '1500', 10),
        fileParseTimeoutMinutes: parseInt(process.env.FILE_PARSE_TIMEOUT_MINUTES || '15', 10),
      },
      streamRecovery: {
        enabled: this.redis?.isReady() ?? false,
        snapshotEndpoint: '/api/ai/streams/:recordId/snapshot',
        maxChars: parseInt(process.env.STREAM_FULL_CONTENT_MAX_CHARS || '2000000', 10),
      },
      templateCache: {
        redisEnabled: process.env.TEMPLATES_LIST_CACHE_REDIS !== '0',
        ttlMs: parseInt(process.env.TEMPLATES_LIST_CACHE_TTL_MS || '30000', 10),
      },
    }
  }

  private async redisQueueLengthSafe(queueName: string): Promise<number> {
    try {
      return await (this.redis?.queueLength(queueName) ?? Promise.resolve(0))
    } catch {
      return 0
    }
  }

  private clipIp(ip?: string | null): string | null {
    if (!ip || !ip.trim()) return null
    const s = ip.trim()
    return s.length > 64 ? s.slice(0, 64) : s
  }

  private changedFields(payload: Record<string, unknown>): string[] {
    return Object.entries(payload)
      .filter(([key, value]) => value !== undefined && !(key === 'apiKey' && String(value).trim() === ''))
      .map(([key]) => key)
  }

  private async writeSettingsAudit(input: {
    operatorId?: string | null
    action: string
    targetType: SettingsAuditTargetType
    targetName: string
    targetId?: string | null
    detail?: Record<string, unknown>
    ip?: string | null
  }) {
    if (!input.operatorId) return
    await this.prisma.adminAuditLog.create({
      data: {
        operatorId: input.operatorId,
        targetUserId: input.operatorId,
        action: input.action,
        ip: this.clipIp(input.ip),
        detail: {
          targetType: input.targetType,
          targetId: input.targetId ?? null,
          targetName: input.targetName,
          ...(input.detail ?? {}),
        },
      },
    })
  }

  getMultimodalConfig() {
    return this.multimodal.getRuntimeConfig()
  }

  async updateMultimodalConfig(
    payload: {
      multimodalEnabled?: boolean
      multimodalDefaultModel?: string
      textFallbackModel?: string
      maxConcurrentTasks?: number
      cacheTtlDays?: number
      monthlyCostAlertCny?: number
      autoDowngradeWhenOverBudget?: boolean
      multimodalInputPricePer1kCny?: number
      multimodalOutputPricePer1kCny?: number
      textInputPricePer1kCny?: number
      textOutputPricePer1kCny?: number
    },
    operatorId?: string,
    ip?: string,
  ) {
    const result = this.multimodal.upsertRuntimeConfig(payload)
    await this.writeSettingsAudit({
      operatorId,
      ip,
      action: ADMIN_AUDIT_ACTION.SETTINGS_MULTIMODAL_CONFIG_UPDATE,
      targetType: 'SETTINGS',
      targetName: '多模态配置',
      detail: {
        changedFields: this.changedFields(payload),
      },
    })
    return result
  }

  async listAiModelsAdmin() {
    const rows = await this.prisma.aIModelConfig.findMany({
      orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
    })
    return rows.map((r) => this.mapToAdminView(r))
  }

  private async ensureSingleDefault(exceptId?: string) {
    await this.prisma.aIModelConfig.updateMany({
      where: exceptId ? { isDefault: true, id: { not: exceptId } } : { isDefault: true },
      data: { isDefault: false },
    })
  }

  /** 全局仅允许一个「文档视觉解析」专用模型 */
  private async ensureSingleVisionParse(exceptId?: string) {
    await this.prisma.aIModelConfig.updateMany({
      where: exceptId
        ? { useForDocumentVisionParse: true, id: { not: exceptId } }
        : { useForDocumentVisionParse: true },
      data: { useForDocumentVisionParse: false },
    })
  }

  async createAiModel(dto: CreateAiModelSettingsDto, operatorId?: string, ip?: string) {
    const baseUrl = normalizeBaseUrl(dto.baseUrl)
    const activeDefaultCount = await this.prisma.aIModelConfig.count({
      where: { isDefault: true, isActive: true },
    })
    const nextActive = dto.isActive ?? true
    if (!nextActive && dto.isDefault) {
      throw new BadRequestException('无法将已停用模型设为默认')
    }
    if (!nextActive && activeDefaultCount === 0) {
      throw new BadRequestException('至少需要一个启用且默认的模型，请先创建启用模型')
    }
    let isDefault = dto.isDefault ?? false
    if (!isDefault && activeDefaultCount === 0 && nextActive) isDefault = true
    if (isDefault) await this.ensureSingleDefault()
    if (dto.useForDocumentVisionParse) await this.ensureSingleVisionParse()
    const row = await this.prisma.aIModelConfig.create({
      data: {
        name: dto.name.trim(),
        provider: dto.provider.trim(),
        modelId: dto.modelId.trim(),
        baseUrl,
        apiKey: dto.apiKey.trim(),
        maxTokens: dto.maxTokens ?? DEFAULT_OUTPUT_TOKENS,
        temperature: dto.temperature ?? 0.7,
        isDefault,
        isActive: nextActive,
        supportsVision: dto.supportsVision ?? false,
        useForDocumentVisionParse: dto.useForDocumentVisionParse ?? false,
      },
    })
    await this.writeSettingsAudit({
      operatorId,
      ip,
      action: ADMIN_AUDIT_ACTION.SETTINGS_AI_MODEL_CREATE,
      targetType: 'AI_MODEL',
      targetId: row.id,
      targetName: row.name,
      detail: {
        provider: row.provider,
        modelId: row.modelId,
        baseUrl: row.baseUrl,
        hasApiKey: !!dto.apiKey.trim(),
        isDefault: row.isDefault,
        isActive: row.isActive,
        supportsVision: row.supportsVision,
        useForDocumentVisionParse: row.useForDocumentVisionParse,
      },
    })
    return this.mapToAdminView(row)
  }

  async updateAiModel(id: string, dto: UpdateAiModelSettingsDto, operatorId?: string, ip?: string) {
    const existing = await this.prisma.aIModelConfig.findUnique({
      where: { id },
    })
    if (!existing) throw new NotFoundException('模型配置不存在')

    if (dto.isDefault === true && (dto.isActive === false || (dto.isActive === undefined && !existing.isActive))) {
      throw new BadRequestException('无法将已停用模型设为默认')
    }
    const willDeactivateDefault = existing.isDefault && dto.isActive === false
    if (willDeactivateDefault) {
      const nextActiveCount = await this.prisma.aIModelConfig.count({
        where: { isActive: true, id: { not: id } },
      })
      if (nextActiveCount < 1) {
        throw new BadRequestException('不能停用最后一个启用中的默认模型')
      }
    }
    if (dto.isDefault === true) await this.ensureSingleDefault(id)
    if (dto.useForDocumentVisionParse === true) await this.ensureSingleVisionParse(id)

    const data: Record<string, unknown> = {}
    if (dto.name !== undefined) data.name = dto.name.trim()
    if (dto.provider !== undefined) data.provider = dto.provider.trim()
    if (dto.modelId !== undefined) data.modelId = dto.modelId.trim()
    if (dto.baseUrl !== undefined) data.baseUrl = normalizeBaseUrl(dto.baseUrl)
    if (dto.maxTokens !== undefined) data.maxTokens = dto.maxTokens
    if (dto.temperature !== undefined) data.temperature = dto.temperature
    if (dto.isDefault !== undefined) data.isDefault = dto.isDefault
    if (dto.isActive !== undefined) data.isActive = dto.isActive
    if (dto.isActive === false && existing.isDefault) data.isDefault = false
    if (dto.apiKey !== undefined && dto.apiKey.trim() !== '') {
      data.apiKey = dto.apiKey.trim()
    }
    if (dto.supportsVision !== undefined) data.supportsVision = dto.supportsVision
    if (dto.useForDocumentVisionParse !== undefined) {
      data.useForDocumentVisionParse = dto.useForDocumentVisionParse
    }

    const result = await this.prisma.aIModelConfig.update({
      where: { id },
      data,
    })

    if (willDeactivateDefault) {
      const next = await this.prisma.aIModelConfig.findFirst({
        where: { isActive: true, id: { not: id } },
        orderBy: { updatedAt: 'desc' },
      })
      if (next) {
        await this.prisma.aIModelConfig.update({
          where: { id: next.id },
          data: { isDefault: true },
        })
      }
    }

    await this.writeSettingsAudit({
      operatorId,
      ip,
      action: ADMIN_AUDIT_ACTION.SETTINGS_AI_MODEL_UPDATE,
      targetType: 'AI_MODEL',
      targetId: existing.id,
      targetName: existing.name,
      detail: {
        changedFields: this.changedFields(dto as Record<string, unknown>),
        apiKeyChanged: dto.apiKey !== undefined && dto.apiKey.trim() !== '',
        provider: result.provider,
        modelId: result.modelId,
        isDefault: result.isDefault,
        isActive: result.isActive,
        supportsVision: result.supportsVision,
        useForDocumentVisionParse: result.useForDocumentVisionParse,
      },
    })

    return this.mapToAdminView(result)
  }

  async archiveAiModel(id: string, operatorId?: string, ip?: string) {
    const existing = await this.prisma.aIModelConfig.findUnique({
      where: { id },
    })
    if (!existing) throw new NotFoundException('模型配置不存在')
    if (existing.isDefault) {
      const next = await this.prisma.aIModelConfig.findFirst({
        where: { isActive: true, id: { not: id } },
        orderBy: { updatedAt: 'desc' },
      })
      if (!next) {
        throw new BadRequestException('不能归档最后一个启用中的默认模型')
      }
    }

    await this.prisma.aIModelConfig.update({
      where: { id },
      data: { isActive: false, isDefault: false },
    })

    if (existing.isDefault) {
      const next = await this.prisma.aIModelConfig.findFirst({
        where: { isActive: true, id: { not: id } },
        orderBy: { updatedAt: 'desc' },
      })
      if (next) {
        await this.prisma.aIModelConfig.update({
          where: { id: next.id },
          data: { isDefault: true },
        })
      }
    }
    await this.writeSettingsAudit({
      operatorId,
      ip,
      action: ADMIN_AUDIT_ACTION.SETTINGS_AI_MODEL_UPDATE,
      targetType: 'AI_MODEL',
      targetId: existing.id,
      targetName: existing.name,
      detail: {
        changedFields: ['isActive', 'isDefault'],
        archived: true,
        modelId: existing.modelId,
      },
    })
    return { ok: true }
  }

  async deleteAiModel(id: string, operatorId?: string, ip?: string) {
    const existing = await this.prisma.aIModelConfig.findUnique({
      where: { id },
    })
    if (!existing) throw new NotFoundException('模型配置不存在')

    try {
      await this.prisma.$transaction(async (tx) => {
        if (existing.isDefault) {
          const next = await tx.aIModelConfig.findFirst({
            where: { isActive: true, id: { not: id } },
            orderBy: { updatedAt: 'desc' },
          })
          if (!next) {
            throw new BadRequestException('不能删除最后一个启用中的默认模型')
          }
          await tx.aIModelConfig.update({
            where: { id: next.id },
            data: { isDefault: true },
          })
        }
        await tx.aIModelConfig.delete({ where: { id } })
      })
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
        throw new ConflictException('该模型已被历史数据引用，无法删除；可先停用该模型')
      }
      throw error
    }
    await this.writeSettingsAudit({
      operatorId,
      ip,
      action: ADMIN_AUDIT_ACTION.SETTINGS_AI_MODEL_DELETE,
      targetType: 'AI_MODEL',
      targetId: existing.id,
      targetName: existing.name,
      detail: {
        provider: existing.provider,
        modelId: existing.modelId,
        wasDefault: existing.isDefault,
        wasActive: existing.isActive,
      },
    })
    return { ok: true }
  }

  async setDefaultAiModel(id: string, operatorId?: string, ip?: string) {
    const existing = await this.prisma.aIModelConfig.findUnique({
      where: { id },
    })
    if (!existing) throw new NotFoundException('模型配置不存在')
    if (!existing.isActive) throw new BadRequestException('已归档的模型不能设为默认')

    await this.ensureSingleDefault(id)
    await this.prisma.aIModelConfig.update({
      where: { id },
      data: { isDefault: true, isActive: true },
    })
    await this.writeSettingsAudit({
      operatorId,
      ip,
      action: ADMIN_AUDIT_ACTION.SETTINGS_AI_MODEL_SET_DEFAULT,
      targetType: 'AI_MODEL',
      targetId: existing.id,
      targetName: existing.name,
      detail: {
        changedFields: ['isDefault', 'isActive'],
        modelId: existing.modelId,
      },
    })
    return { ok: true }
  }
}
