import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common'
import { AIModelConfig } from '@prisma/client'
import { PrismaService } from '@/prisma/prisma.service'
import { CreateAiModelSettingsDto, UpdateAiModelSettingsDto } from './dto/ai-model-settings.dto'

function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, '')
}

@Injectable()
export class SettingsService {
  constructor(private prisma: PrismaService) {}

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
      hasApiKey: !!(r.apiKey && r.apiKey.length > 0 && r.apiKey !== 'placeholder'),
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }
  }

  getRuntimeHints() {
    const raw = parseInt(process.env.MAX_FILE_SIZE || '10485760', 10)
    const maxUploadMb = Math.max(1, Math.floor(raw / 1024 / 1024))
    return {
      maxUploadMb,
      maxFileSizeBytes: raw,
      throttleTtlSec: parseInt(process.env.THROTTLE_TTL || '60', 10),
      throttleLimit: parseInt(process.env.THROTTLE_LIMIT || '100', 10),
    }
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

  async createAiModel(dto: CreateAiModelSettingsDto) {
    const baseUrl = normalizeBaseUrl(dto.baseUrl)
    const activeDefaultCount = await this.prisma.aIModelConfig.count({
      where: { isDefault: true, isActive: true },
    })
    let isDefault = dto.isDefault ?? false
    if (!isDefault && activeDefaultCount === 0) isDefault = true
    if (isDefault) await this.ensureSingleDefault()
    const row = await this.prisma.aIModelConfig.create({
      data: {
        name: dto.name.trim(),
        provider: dto.provider.trim(),
        modelId: dto.modelId.trim(),
        baseUrl,
        apiKey: dto.apiKey.trim(),
        maxTokens: dto.maxTokens ?? 4096,
        temperature: dto.temperature ?? 0.7,
        isDefault,
        isActive: dto.isActive ?? true,
      },
    })
    return this.mapToAdminView(row)
  }

  async updateAiModel(id: string, dto: UpdateAiModelSettingsDto) {
    const existing = await this.prisma.aIModelConfig.findUnique({ where: { id } })
    if (!existing) throw new NotFoundException('模型配置不存在')

    if (dto.isDefault === true && dto.isActive === false) {
      throw new BadRequestException('无法将已停用模型设为默认')
    }
    if (dto.isDefault === true) await this.ensureSingleDefault(id)

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

    const result = await this.prisma.aIModelConfig.update({ where: { id }, data })

    if (dto.isActive === false && existing.isDefault) {
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

    return this.mapToAdminView(result)
  }

  async archiveAiModel(id: string) {
    const existing = await this.prisma.aIModelConfig.findUnique({ where: { id } })
    if (!existing) throw new NotFoundException('模型配置不存在')

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
    return { ok: true }
  }

  async setDefaultAiModel(id: string) {
    const existing = await this.prisma.aIModelConfig.findUnique({ where: { id } })
    if (!existing) throw new NotFoundException('模型配置不存在')
    if (!existing.isActive) throw new BadRequestException('已归档的模型不能设为默认')

    await this.ensureSingleDefault(id)
    await this.prisma.aIModelConfig.update({
      where: { id },
      data: { isDefault: true, isActive: true },
    })
    return { ok: true }
  }
}
