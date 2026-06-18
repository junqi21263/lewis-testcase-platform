import { BadRequestException, Injectable } from '@nestjs/common'
import {
  CoverageExportPayload,
  CoverageIntegrationProvider,
  CoverageIntegrationResult,
  CoverageWritebackPayload,
} from './coverage-integration.types'

const PROVIDERS: CoverageIntegrationProvider[] = ['jira', 'tapd', 'feishu']

@Injectable()
export class CoverageIntegrationService {
  normalizeProvider(provider: string): CoverageIntegrationProvider {
    const normalized = provider.trim().toLowerCase() as CoverageIntegrationProvider
    if (!PROVIDERS.includes(normalized)) {
      throw new BadRequestException(`不支持的覆盖矩阵集成平台：${provider}`)
    }
    return normalized
  }

  buildExportPayload(payload: CoverageExportPayload): CoverageExportPayload {
    return {
      ...payload,
      generatedAt: payload.generatedAt || new Date().toISOString(),
      requirements: payload.requirements.map((req) => ({
        ...req,
        cases: req.cases ?? [],
        issues: req.issues ?? [],
      })),
    }
  }

  async exportCoverage(
    provider: CoverageIntegrationProvider,
    payload: CoverageExportPayload,
    options: { dryRun?: boolean } = {},
  ): Promise<CoverageIntegrationResult> {
    const normalized = this.normalizeProvider(provider)
    const exportPayload = this.buildExportPayload(payload)
    return {
      provider: normalized,
      dryRun: options.dryRun !== false,
      exported: exportPayload.requirements.length,
      writtenBack: 0,
      warnings: options.dryRun === false ? ['真实平台 API 尚未绑定，当前仅完成适配层校验。'] : [],
    }
  }

  async writebackCoverage(
    payload: CoverageWritebackPayload,
    options: { dryRun?: boolean } = {},
  ): Promise<CoverageIntegrationResult> {
    const provider = this.normalizeProvider(payload.provider)
    return {
      provider,
      dryRun: options.dryRun !== false,
      exported: 0,
      writtenBack: payload.items.length,
      warnings: options.dryRun === false ? ['真实平台 API 尚未绑定，当前仅完成回写载荷校验。'] : [],
    }
  }
}
