import { BadRequestException, Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import * as crypto from 'crypto'
import * as fs from 'fs'
import type { Prisma } from '@prisma/client'
import { PrismaService } from '@/prisma/prisma.service'
import { CosStorageService } from '@/modules/files/cos-storage.service'
import {
  analyzeCosFileWithHunyuanMultimodal,
  canTryHunyuanCosMultimodalParse,
  runHunyuanCosPrompt,
} from '@/utils/multimodalAnalysis'

export type MultimodalModuleType = 'FILE_PARSE' | 'AI_ANALYSIS' | 'TESTCASE_GENERATION'
export type MultimodalFileKind =
  | 'IMAGE'
  | 'PDF'
  | 'WORD'
  | 'EXCEL'
  | 'TEXT'
  | 'YAML'
  | 'JSON'
  | 'OTHER'

export type RuntimeConfigPayload = {
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
}

const RUNTIME_DEFAULTS: Required<RuntimeConfigPayload> = {
  multimodalEnabled: true,
  multimodalDefaultModel: 'hunyuan-vision',
  textFallbackModel: 'hunyuan-pro',
  maxConcurrentTasks: 3,
  cacheTtlDays: 7,
  monthlyCostAlertCny: 10,
  autoDowngradeWhenOverBudget: false,
  multimodalInputPricePer1kCny: 0,
  multimodalOutputPricePer1kCny: 0,
  textInputPricePer1kCny: 0,
  textOutputPricePer1kCny: 0,
}

@Injectable()
export class MultimodalService {
  private readonly logger = new Logger(MultimodalService.name)
  private cacheCfg:
    | (Required<RuntimeConfigPayload> & {
        id?: string
        updatedAt?: Date
      })
    | null = null
  private cacheAt = 0

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly cosStorage: CosStorageService,
  ) {}

  private ttlMs() {
    return 5000
  }

  private normalize(cfg?: RuntimeConfigPayload) {
    return {
      ...RUNTIME_DEFAULTS,
      ...(cfg ?? {}),
    }
  }

  private applyEnvOverride(cfg: Required<RuntimeConfigPayload>) {
    const envBool = (k: string): boolean | undefined => {
      const v = this.config.get<string>(k)
      if (v === undefined) return undefined
      return v === '1' || v.toLowerCase() === 'true'
    }
    const envNum = (k: string): number | undefined => {
      const v = this.config.get<string>(k)
      if (v === undefined || v === '') return undefined
      const n = Number(v)
      return Number.isFinite(n) ? n : undefined
    }
    const envStr = (k: string): string | undefined => {
      const v = this.config.get<string>(k)
      return v?.trim() ? v.trim() : undefined
    }
    return {
      ...cfg,
      multimodalEnabled:
        envBool('MM_ENABLED') ?? envBool('HUNYUAN_COS_MULTIMODAL_PARSE_ENABLED') ?? cfg.multimodalEnabled,
      multimodalDefaultModel:
        envStr('MM_DEFAULT_MODEL') ?? envStr('HUNYUAN_MULTIMODAL_MODEL') ?? cfg.multimodalDefaultModel,
      textFallbackModel: envStr('MM_TEXT_FALLBACK_MODEL') ?? cfg.textFallbackModel,
      maxConcurrentTasks: envNum('MM_MAX_CONCURRENT') ?? cfg.maxConcurrentTasks,
      cacheTtlDays: envNum('MM_CACHE_TTL_DAYS') ?? cfg.cacheTtlDays,
      monthlyCostAlertCny: envNum('MM_MONTHLY_ALERT_CNY') ?? cfg.monthlyCostAlertCny,
      autoDowngradeWhenOverBudget:
        envBool('MM_AUTO_DOWNGRADE_WHEN_OVER_BUDGET') ?? cfg.autoDowngradeWhenOverBudget,
      multimodalInputPricePer1kCny:
        envNum('MM_PRICE_MULTIMODAL_INPUT_1K_CNY') ?? cfg.multimodalInputPricePer1kCny,
      multimodalOutputPricePer1kCny:
        envNum('MM_PRICE_MULTIMODAL_OUTPUT_1K_CNY') ?? cfg.multimodalOutputPricePer1kCny,
      textInputPricePer1kCny: envNum('MM_PRICE_TEXT_INPUT_1K_CNY') ?? cfg.textInputPricePer1kCny,
      textOutputPricePer1kCny: envNum('MM_PRICE_TEXT_OUTPUT_1K_CNY') ?? cfg.textOutputPricePer1kCny,
    }
  }

  async getRuntimeConfig(force = false) {
    if (!force && this.cacheCfg && Date.now() - this.cacheAt < this.ttlMs()) return this.cacheCfg
    const row = await (this.prisma as any).systemRuntimeConfig?.findFirst?.({
      orderBy: { createdAt: 'asc' },
    })
    const normalized = this.applyEnvOverride(this.normalize(row ?? {}))
    this.cacheCfg = { ...normalized, id: row?.id, updatedAt: row?.updatedAt }
    this.cacheAt = Date.now()
    return this.cacheCfg
  }

  async upsertRuntimeConfig(payload: RuntimeConfigPayload) {
    const safe = this.normalize(payload)
    const existed = await (this.prisma as any).systemRuntimeConfig?.findFirst?.({
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    })
    const row = existed
      ? await (this.prisma as any).systemRuntimeConfig.update({
          where: { id: existed.id },
          data: safe,
        })
      : await (this.prisma as any).systemRuntimeConfig.create({
          data: safe,
        })
    this.cacheCfg = { ...safe, id: row.id, updatedAt: row.updatedAt }
    this.cacheAt = Date.now()
    return this.cacheCfg
  }

  resolveFileKind(mimeType: string): MultimodalFileKind {
    const m = (mimeType || '').toLowerCase()
    if (m.startsWith('image/')) return 'IMAGE'
    if (m.includes('pdf')) return 'PDF'
    if (m.includes('word') || m.includes('officedocument.wordprocessingml')) return 'WORD'
    if (m.includes('excel') || m.includes('spreadsheetml')) return 'EXCEL'
    if (m.includes('yaml') || m.includes('yml')) return 'YAML'
    if (m.includes('json')) return 'JSON'
    if (m.startsWith('text/')) return 'TEXT'
    return 'OTHER'
  }

  buildMd5FromBuffer(buf: Buffer): string {
    return crypto.createHash('md5').update(buf).digest('hex')
  }

  buildMd5FromFile(localPath: string): string {
    const b = fs.readFileSync(localPath)
    return this.buildMd5FromBuffer(b)
  }

  buildMd5ByKey(raw: string): string {
    return crypto.createHash('md5').update(raw).digest('hex')
  }

  async getCache(md5: string, moduleType: MultimodalModuleType) {
    const now = new Date()
    const row = await (this.prisma as any).multimodalCacheEntry?.findUnique?.({
      where: { md5_moduleType: { md5, moduleType } },
    })
    if (!row) return null
    if (row.expiresAt && new Date(row.expiresAt).getTime() <= now.getTime()) return null
    await (this.prisma as any).multimodalCacheEntry.update({
      where: { id: row.id },
      data: { hitCount: { increment: 1 }, lastHitAt: now },
    })
    return row
  }

  async setCache(args: {
    md5: string
    moduleType: MultimodalModuleType
    fileKind: MultimodalFileKind
    parseResult?: string
    analysisResult?: string
    testcaseResult?: string
  }) {
    const cfg = await this.getRuntimeConfig()
    const ttlDays = Math.max(1, cfg.cacheTtlDays)
    const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000)
    return (this.prisma as any).multimodalCacheEntry?.upsert?.({
      where: { md5_moduleType: { md5: args.md5, moduleType: args.moduleType } },
      update: {
        fileKind: args.fileKind,
        parseResult: args.parseResult ?? undefined,
        analysisResult: args.analysisResult ?? undefined,
        testcaseResult: args.testcaseResult ?? undefined,
        expiresAt,
      },
      create: {
        md5: args.md5,
        moduleType: args.moduleType,
        fileKind: args.fileKind,
        parseResult: args.parseResult ?? undefined,
        analysisResult: args.analysisResult ?? undefined,
        testcaseResult: args.testcaseResult ?? undefined,
        expiresAt,
      },
    })
  }

  async clearCache(id?: string) {
    if (id) {
      await (this.prisma as any).multimodalCacheEntry.delete({ where: { id } })
      return { ok: true, deleted: 1 }
    }
    const ret = await (this.prisma as any).multimodalCacheEntry.deleteMany({})
    return { ok: true, deleted: ret?.count ?? 0 }
  }

  estimateCostCny(args: {
    promptTokens?: number
    completionTokens?: number
    mode: 'multimodal' | 'text'
    runtime: Required<RuntimeConfigPayload>
  }) {
    const inTokens = Math.max(0, args.promptTokens ?? 0)
    const outTokens = Math.max(0, args.completionTokens ?? 0)
    if (args.mode === 'multimodal') {
      return (
        (inTokens / 1000) * args.runtime.multimodalInputPricePer1kCny +
        (outTokens / 1000) * args.runtime.multimodalOutputPricePer1kCny
      )
    }
    return (
      (inTokens / 1000) * args.runtime.textInputPricePer1kCny +
      (outTokens / 1000) * args.runtime.textOutputPricePer1kCny
    )
  }

  async recordUsage(args: {
    moduleType: MultimodalModuleType
    fileKind: MultimodalFileKind
    userId: string
    uploadedFileId?: string
    recordId?: string
    batchTaskId?: string
    provider?: string
    modelName?: string
    requestChars?: number
    promptTokens?: number
    completionTokens?: number
    totalTokens?: number
    cacheHit?: boolean
    success?: boolean
    errorMessage?: string
    latencyMs?: number
    extraMeta?: Prisma.InputJsonValue
    mode?: 'multimodal' | 'text'
  }) {
    const runtime = await this.getRuntimeConfig()
    const estimatedCostCny = this.estimateCostCny({
      promptTokens: args.promptTokens,
      completionTokens: args.completionTokens,
      mode: args.mode ?? 'multimodal',
      runtime: runtime as Required<RuntimeConfigPayload>,
    })
    return (this.prisma as any).multimodalUsageRecord?.create?.({
      data: {
        moduleType: args.moduleType,
        fileKind: args.fileKind,
        userId: args.userId,
        uploadedFileId: args.uploadedFileId,
        recordId: args.recordId,
        batchTaskId: args.batchTaskId,
        provider: args.provider ?? undefined,
        modelName: args.modelName ?? undefined,
        requestChars: args.requestChars ?? 0,
        promptTokens: args.promptTokens ?? 0,
        completionTokens: args.completionTokens ?? 0,
        totalTokens: args.totalTokens ?? (args.promptTokens ?? 0) + (args.completionTokens ?? 0),
        estimatedCostCny,
        cacheHit: args.cacheHit ?? false,
        success: args.success ?? true,
        errorMessage: args.errorMessage?.slice(0, 4000),
        latencyMs: args.latencyMs,
        extraMeta: args.extraMeta,
      },
    })
  }

  async monthCostCny() {
    const now = new Date()
    const start = new Date(now.getFullYear(), now.getMonth(), 1)
    const agg = await (this.prisma as any).multimodalUsageRecord.aggregate({
      where: { createdAt: { gte: start } },
      _sum: { estimatedCostCny: true },
    })
    return Number(agg?._sum?.estimatedCostCny ?? 0)
  }

  async shouldAutoDowngradeToText() {
    const cfg = await this.getRuntimeConfig()
    if (!cfg.multimodalEnabled) return true
    if (!cfg.autoDowngradeWhenOverBudget) return false
    const monthCost = await this.monthCostCny()
    return monthCost >= cfg.monthlyCostAlertCny
  }

  /** 图片/PDF 尝试混元直读（失败返回 null，由上层走 OCR/文本降级） */
  async tryDirectCosMultimodal(args: {
    moduleType: MultimodalModuleType
    fileKind: MultimodalFileKind
    userId: string
    uploadedFileId?: string
    recordId?: string
    storedPath: string
    localPath?: string
    fileBytes: number
  }): Promise<{ text: string; md5: string; cacheHit: boolean } | null> {
    if (!(args.fileKind === 'IMAGE' || args.fileKind === 'PDF')) return null
    if (await this.shouldAutoDowngradeToText()) return null

    const md5 = args.localPath
      ? this.buildMd5FromFile(args.localPath)
      : this.buildMd5ByKey(`${args.storedPath}:${args.fileBytes}`)
    const cached = await this.getCache(md5, args.moduleType)
    if (cached) {
      const value =
        args.moduleType === 'FILE_PARSE'
          ? cached.parseResult
          : args.moduleType === 'AI_ANALYSIS'
            ? cached.analysisResult
            : cached.testcaseResult
      if (typeof value === 'string' && value.trim()) {
        await this.recordUsage({
          moduleType: args.moduleType,
          fileKind: args.fileKind,
          userId: args.userId,
          uploadedFileId: args.uploadedFileId,
          recordId: args.recordId,
          provider: 'cache',
          modelName: 'cache',
          cacheHit: true,
          success: true,
          mode: 'multimodal',
        })
        return { text: value, md5, cacheHit: true }
      }
    }

    const canTry = canTryHunyuanCosMultimodalParse(
      this.config,
      this.cosStorage,
      args.storedPath,
      args.fileKind === 'IMAGE' ? 'image' : 'pdf',
      args.fileBytes,
    )
    if (!canTry) return null

    const started = Date.now()
    try {
      const text = await analyzeCosFileWithHunyuanMultimodal({
        config: this.config,
        cosStorage: this.cosStorage,
        storedPath: args.storedPath,
        fileKind: args.fileKind === 'IMAGE' ? 'image' : 'pdf',
      })
      const payload =
        args.moduleType === 'FILE_PARSE'
          ? { parseResult: text }
          : args.moduleType === 'AI_ANALYSIS'
            ? { analysisResult: text }
            : { testcaseResult: text }
      await this.setCache({
        md5,
        moduleType: args.moduleType,
        fileKind: args.fileKind,
        ...payload,
      })
      await this.recordUsage({
        moduleType: args.moduleType,
        fileKind: args.fileKind,
        userId: args.userId,
        uploadedFileId: args.uploadedFileId,
        recordId: args.recordId,
        provider: 'hunyuan',
        modelName: 'hunyuan-vision',
        requestChars: text.length,
        success: true,
        latencyMs: Date.now() - started,
        mode: 'multimodal',
      })
      return { text, md5, cacheHit: false }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      this.logger.warn(`tryDirectCosMultimodal failed: ${msg}`)
      await this.recordUsage({
        moduleType: args.moduleType,
        fileKind: args.fileKind,
        userId: args.userId,
        uploadedFileId: args.uploadedFileId,
        recordId: args.recordId,
        provider: 'hunyuan',
        modelName: 'hunyuan-vision',
        success: false,
        errorMessage: msg,
        latencyMs: Date.now() - started,
        mode: 'multimodal',
      })
      return null
    }
  }

  async analyzeFileForRequirements(args: {
    userId: string
    storedPath: string
    localPath?: string
    fileKind: 'IMAGE' | 'PDF'
    fileBytes: number
    customPrompt?: string
    uploadedFileId?: string
    recordId?: string
  }) {
    const md5 = args.localPath
      ? this.buildMd5FromFile(args.localPath)
      : this.buildMd5ByKey(`${args.storedPath}:${args.fileBytes}`)
    const cached = await this.getCache(md5, 'AI_ANALYSIS')
    if (cached?.analysisResult) {
      await this.recordUsage({
        moduleType: 'AI_ANALYSIS',
        fileKind: args.fileKind,
        userId: args.userId,
        uploadedFileId: args.uploadedFileId,
        recordId: args.recordId,
        cacheHit: true,
        provider: 'cache',
        modelName: 'cache',
      })
      return { text: cached.analysisResult as string, cacheHit: true, md5 }
    }
    const basePrompt =
      args.customPrompt?.trim() ||
      '请对该设计图/文档进行结构化需求分析，输出 markdown，并覆盖页面功能、模块、交互、数据模型、风险建议。'
    const started = Date.now()
    const out = await runHunyuanCosPrompt({
      config: this.config,
      cosStorage: this.cosStorage,
      storedPath: args.storedPath,
      fileKind: args.fileKind === 'IMAGE' ? 'image' : 'pdf',
      prompt: basePrompt,
    })
    await this.setCache({
      md5,
      moduleType: 'AI_ANALYSIS',
      fileKind: args.fileKind,
      analysisResult: out.text,
    })
    await this.recordUsage({
      moduleType: 'AI_ANALYSIS',
      fileKind: args.fileKind,
      userId: args.userId,
      uploadedFileId: args.uploadedFileId,
      recordId: args.recordId,
      provider: 'hunyuan',
      modelName: 'hunyuan-vision',
      promptTokens: out.promptTokens,
      completionTokens: out.completionTokens,
      totalTokens: out.totalTokens,
      latencyMs: Date.now() - started,
      mode: 'multimodal',
    })
    return { text: out.text, cacheHit: false, md5 }
  }

  async generateCasesFromFile(args: {
    userId: string
    storedPath: string
    localPath?: string
    fileKind: 'IMAGE' | 'PDF'
    fileBytes: number
    customPrompt?: string
    uploadedFileId?: string
    recordId?: string
  }) {
    const md5 = args.localPath
      ? this.buildMd5FromFile(args.localPath)
      : this.buildMd5ByKey(`${args.storedPath}:${args.fileBytes}`)
    const cached = await this.getCache(md5, 'TESTCASE_GENERATION')
    if (cached?.testcaseResult) {
      await this.recordUsage({
        moduleType: 'TESTCASE_GENERATION',
        fileKind: args.fileKind,
        userId: args.userId,
        uploadedFileId: args.uploadedFileId,
        recordId: args.recordId,
        cacheHit: true,
        provider: 'cache',
        modelName: 'cache',
      })
      return { text: cached.testcaseResult as string, cacheHit: true, md5 }
    }
    const prompt =
      args.customPrompt?.trim() ||
      `你是资深测试架构师。请直接理解该设计图或 PDF，输出严格 JSON：{"cases":[...]}。
每条用例必须含 title/priority/type/precondition/steps/expectedResult/tags，覆盖正向、逆向、边界、交互与跳转。`
    const started = Date.now()
    const out = await runHunyuanCosPrompt({
      config: this.config,
      cosStorage: this.cosStorage,
      storedPath: args.storedPath,
      fileKind: args.fileKind === 'IMAGE' ? 'image' : 'pdf',
      prompt,
    })
    await this.setCache({
      md5,
      moduleType: 'TESTCASE_GENERATION',
      fileKind: args.fileKind,
      testcaseResult: out.text,
    })
    await this.recordUsage({
      moduleType: 'TESTCASE_GENERATION',
      fileKind: args.fileKind,
      userId: args.userId,
      uploadedFileId: args.uploadedFileId,
      recordId: args.recordId,
      provider: 'hunyuan',
      modelName: 'hunyuan-vision',
      promptTokens: out.promptTokens,
      completionTokens: out.completionTokens,
      totalTokens: out.totalTokens,
      latencyMs: Date.now() - started,
      mode: 'multimodal',
    })
    return { text: out.text, cacheHit: false, md5 }
  }

  async createBatchTask(args: {
    title: string
    moduleType: MultimodalModuleType
    creatorId: string
    files: Array<{ uploadedFileId?: string; fileName: string; fileKind: MultimodalFileKind }>
  }) {
    if (!args.files.length) throw new BadRequestException('至少需要 1 个文件')
    if (args.files.length > 20) throw new BadRequestException('单批最多 20 个文件')
    const task = await (this.prisma as any).batchTask.create({
      data: {
        title: args.title,
        moduleType: args.moduleType,
        creatorId: args.creatorId,
        totalCount: args.files.length,
        items: {
          create: args.files.map((f, i) => ({
            uploadedFileId: f.uploadedFileId,
            fileName: f.fileName,
            fileKind: f.fileKind,
            seq: i + 1,
          })),
        },
      },
      include: { items: true },
    })
    return task
  }

  async listBatchTasks(userId: string) {
    return (this.prisma as any).batchTask.findMany({
      where: { creatorId: userId },
      include: {
        items: { orderBy: { seq: 'asc' } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })
  }

  async updateBatchTaskState(
    userId: string,
    taskId: string,
    action: 'pause' | 'resume' | 'cancel',
  ) {
    const row = await (this.prisma as any).batchTask.findUnique({ where: { id: taskId } })
    if (!row || row.creatorId !== userId) throw new BadRequestException('批任务不存在')
    if (action === 'pause') {
      return (this.prisma as any).batchTask.update({
        where: { id: taskId },
        data: { paused: true, status: 'PAUSED' },
      })
    }
    if (action === 'resume') {
      return (this.prisma as any).batchTask.update({
        where: { id: taskId },
        data: { paused: false, status: 'RUNNING' },
      })
    }
    return (this.prisma as any).batchTask.update({
      where: { id: taskId },
      data: { cancelled: true, status: 'CANCELLED' },
    })
  }
}
