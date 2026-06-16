import { Injectable, BadRequestException, ForbiddenException, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import OpenAI from 'openai'
import { Response } from 'express'
import { PrismaService } from '@/prisma/prisma.service'
import { GenerationSource, GenerationStatus, Prisma, TestCasePriority, TestCaseType, TestCaseVersionSource, UploadedFile } from '@prisma/client'
import { MultimodalService } from '@/modules/multimodal/multimodal.service'
import { isHunyuanMultimodalEnabled, resolveHunyuanVisionApiKey } from '@/utils/multimodalAnalysis'
import { GenerateDto } from './dto/generate.dto'
import { CreateAnalysisDto } from './dto/create-analysis.dto'
import { parseLooseMarkdownToCaseRows } from './parse-loose-ai-output.util'
import { clampGenerationUserContent, humanizeAiProviderError, INPUT_CLAMPED_NOTICE_PREFIX, OUTPUT_TRUNCATED_NOTICE, roughTokenEstimateFromChars } from './ai-generation-limits.util'
import { normalizeCaseRowForPersistence } from './case-row-normalize.util'
import { buildQualityReport as buildAiOutputQualityReport } from './quality-check.util'
import { buildAutoRepairNotice, shouldAutoRepairQuality } from './auto-repair-quality.util'
import {
  resolveContinuationAttempts,
  resolveMaxTokens,
  resolveStreamContentMaxChars,
  shouldAttemptContinuation,
  buildPlainTextContinuationMessages,
} from './ai-output-budget.util'
import { buildJsonObjectResponseFormat, buildStrictCaseResponseFormat, isStructuredOutputUnsupportedError, validateCaseRowsAgainstSchema } from './testcase-output-schema.util'
import { buildClosedLoopPlan, type ClosedLoopCase, type ClosedLoopMutation } from './closed-loop-agent.util'
import {
  analyzePromptTemplateFormat,
  buildPromptEvaluationComparison,
  buildPromptEvaluationRuntimePrompt,
  buildPromptEvaluationSummary,
  detectPromptEvaluationCompatibility,
  PROMPT_EVAL_SAMPLE_SET,
  resolvePromptEvaluationMaxTokens,
  validateOptimizedPromptDraft,
  type PromptEvaluationReport,
  type PromptOptimizationDraft,
  type PromptEvalSampleResult,
} from '@/modules/templates/prompt-template-evaluation.util'
import { ReviewsService } from '@/modules/reviews/reviews.service'
import { buildSnapshotFromCase } from '@/modules/reviews/case-snapshot.util'

type PromptEvaluationProgressEvent = {
  stage?:
    | 'format_check'
    | 'original_evaluation'
    | 'ai_optimization'
    | 'guardrail_check'
    | 'optimized_evaluation'
    | 'comparison'
  progress?: number
  message?: string
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name)
  private readonly jsonSchemaUnsupportedModels = new Set<string>()

  /** 从模型输出中尽量提取 cases 数组（兼容 Markdown 代码块、前后缀说明文字） */
  private extractCaseRows(raw: string): any[] {
    const text = (raw || '').trim()
    if (!text) return []

    const tryJson = (s: string) => {
      try {
        return JSON.parse(s)
      } catch {
        return null
      }
    }

    let parsed: any = tryJson(text)
    if (parsed?.cases && Array.isArray(parsed.cases)) return parsed.cases

    const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
    if (fence) {
      const inner = fence[1].trim()
      parsed = tryJson(inner)
      if (parsed?.cases && Array.isArray(parsed.cases)) return parsed.cases
      if (Array.isArray(parsed)) return parsed
    }

    const start = text.indexOf('{')
    const end = text.lastIndexOf('}')
    if (start !== -1 && end > start) {
      parsed = tryJson(text.slice(start, end + 1))
      if (parsed?.cases && Array.isArray(parsed.cases)) return parsed.cases
    }

    const a0 = text.indexOf('[')
    const a1 = text.lastIndexOf(']')
    if (a0 !== -1 && a1 > a0) {
      parsed = tryJson(text.slice(a0, a1 + 1))
      if (Array.isArray(parsed)) return parsed
    }

    // 思考过程 + 末尾 JSON 混排时，优先取最后一次出现的 "cases" 块
    let searchPos = text.length
    for (let i = 0; i < 8; i++) {
      const keyIdx = text.lastIndexOf('"cases"', searchPos - 1)
      if (keyIdx < 0) break
      const start = text.lastIndexOf('{', keyIdx)
      if (start >= 0) {
        const end = text.lastIndexOf('}')
        if (end > start) {
          parsed = tryJson(text.slice(start, end + 1))
          if (parsed?.cases && Array.isArray(parsed.cases) && parsed.cases.length > 0) {
            return parsed.cases
          }
        }
      }
      searchPos = keyIdx
    }

    return []
  }

  /**
   * 当模型未按约定输出 JSON 时，二次请求把“原文”修复为标准 JSON（仅失败时触发，避免常态额外成本）。
   * 返回修复后的文本（应为 { cases: [...] }），失败则返回 null。
   */
  private async tryRepairToJsonObject(client: OpenAI, modelId: string, rawText: string, schemaErrors?: string[]): Promise<{ repairedText: string; finishReason: string | null } | null> {
    const src = (rawText || '').trim()
    if (!src) return null
    // 太长时只给首尾，避免修复请求也超上下文
    const slice = src.length > 80_000 ? `${src.slice(0, 50_000)}\n\n…(中间省略)…\n\n${src.slice(-30_000)}` : src

    try {
      const validationHint = schemaErrors?.length
        ? `\n\n当前结构校验错误，请逐项修复：\n${schemaErrors
            .slice(0, 20)
            .map((x) => `- ${x}`)
            .join('\n')}`
        : ''
      const { completion } = await this.createCaseCompletion(client, {
        model: modelId,
        messages: [
          {
            role: 'system',
            content: 'You are a converter. Convert user text into ONE valid JSON object that satisfies the required testcase schema. Output ONLY JSON. The first non-whitespace character must be {.',
          },
          {
            role: 'user',
            content: `请把下面文本严格整理为平台约定的 JSON 结构，仅输出一个 JSON 对象：\n` + `- 顶层必须是 { "cases": [...] }\n` + `- 每条用例对象必须包含：title, module, priority, riskLevel, type, precondition, steps, expectedResult, tags, mermaid\n` + `- priority 只能是 P0/P1/P2/P3；riskLevel 只能是 high/medium/low；type 只能是 FUNCTIONAL/PERFORMANCE/SECURITY/COMPATIBILITY/REGRESSION\n` + `- steps 每一步必须包含 order, action, expected；expected 可为空字符串但字段不能缺失\n` + `- mermaid 必须是合法 Mermaid flowchart 字符串；没有流程图时用 null\n` + `- tags 必须包含短标签，建议包含 模块:<module>；禁止 Markdown/解释文字/代码围栏` + `${validationHint}\n\n` + `待整理文本：\n\n${slice}`,
          },
        ],
        temperature: 0,
          max_tokens: this.effectiveMaxTokens(),
      })
      const choice = completion.choices?.[0]
      const repairedText = String(choice?.message?.content ?? '').trim()
      if (!repairedText) return null
      return {
        repairedText,
        finishReason: (choice?.finish_reason as string | undefined) ?? null,
      }
    } catch (e) {
      this.logger.warn('修复为 JSON 失败，继续走启发式解析', e as Error)
      return null
    }
  }

  /** 无法解析为 JSON 用例时落库一条「原文」用例，避免成功状态却 0 条记录 */
  private fallbackCasesFromRawOutput(raw: string): any[] {
    const t = (raw || '').trim()
    if (!t) return []
    const body = t.length > 200_000 ? `${t.slice(0, 200_000)}\n\n…(内容过长已截断，完整文本请从生成流式输出中复制)` : t
    return [
      {
        title: 'AI 生成结果（非 JSON，可人工拆分或换用要求 JSON 输出的模板）',
        precondition: '',
        steps: [
          {
            order: 1,
            action: '查看下方预期结果中的完整模型输出',
            expected: '',
          },
        ],
        expectedResult: body,
        priority: 'P2',
        type: 'FUNCTIONAL',
        tags: ['ai-raw-output'],
      },
    ]
  }

  /** 模型无可用文本 / 无法解析为 JSON 用例时，统一错误说明（不再落库「占位假用例」） */
  private emptyOutputUserMessage(opts?: { outputTruncated?: boolean }): string {
    const base = '模型未返回可解析的 JSON 用例（输出为空或结构不符合约定）。请检查：系统设置中的模型 ID、API Key、Base URL；需求/文本是否为空；图片是否已解析出文字；适当提高 maxTokens；智谱等兼容接口流式是否仅返回在 delta 的其他字段。可在生成记录中查看详情。'
    if (opts?.outputTruncated) {
      return `${base} 另外：本次回复可能因达到「最大 Token」被截断，请先调高 Token 上限或缩小生成范围后重试。`
    }
    return base
  }

  private effectiveMaxTokens(requested?: number): number {
    return resolveMaxTokens(requested, {
      defaultTokens: Number(this.config.get<string>('AI_DEFAULT_MAX_TOKENS') ?? ''),
      maxTokens: Number(this.config.get<string>('AI_MAX_OUTPUT_TOKENS') ?? ''),
    })
  }

  private streamFullContentMaxChars(): number {
    return resolveStreamContentMaxChars(this.config.get<string>('STREAM_FULL_CONTENT_MAX_CHARS'))
  }

  private continuationMaxAttempts(): number {
    return resolveContinuationAttempts(this.config.get<string>('AI_CONTINUATION_MAX_ATTEMPTS'))
  }

  private writeStreamNotice(res: Response, text: string) {
    if (res.writableEnded) return
    res.write(`data: ${JSON.stringify({ notice: text })}\n\n`)
  }

  private strictSchemaEnabled(): boolean {
    const raw = String(this.config.get<string>('AI_STRICT_SCHEMA_OUTPUT') ?? 'true').toLowerCase()
    return !['0', 'false', 'off', 'no'].includes(raw)
  }

  private structuredOutputFallbackNotice(): string {
    return '当前模型网关不支持 json_schema 严格结构化输出，已回退兼容模式，并继续执行本地 schema 校验与自动修复。'
  }

  private schemaRepairNotice(errors?: string[]): string {
    const detail = errors?.length ? `（${errors.slice(0, 4).join('；')}）` : ''
    return `AI 输出未完全符合严格用例 schema${detail}，已自动修复/规范化后入库。`
  }

  private structuredOutputCacheKey(payload: Record<string, unknown>): string {
    const model = typeof payload.model === 'string' && payload.model.trim() ? payload.model.trim() : 'unknown-model'
    return model
  }

  private async createCaseCompletion(client: OpenAI, payload: Record<string, unknown>): Promise<{ completion: any; fallbackNotice?: string }> {
    const cacheKey = this.structuredOutputCacheKey(payload)
    const shouldTryStrictSchema = this.strictSchemaEnabled() && !this.jsonSchemaUnsupportedModels.has(cacheKey)
    let discoveredUnsupported = false

    if (shouldTryStrictSchema) {
      try {
        const completion = await client.chat.completions.create({
          ...payload,
          response_format: buildStrictCaseResponseFormat() as any,
        } as any)
        return { completion }
      } catch (err) {
        if (!isStructuredOutputUnsupportedError(err)) throw err
        this.jsonSchemaUnsupportedModels.add(cacheKey)
        discoveredUnsupported = true
        this.logger.warn(`严格 json_schema 输出不可用，回退 json_object: ${(err as Error).message}`)
      }
    }

    const completion = await client.chat.completions.create({
      ...payload,
      response_format: buildJsonObjectResponseFormat() as any,
    } as any)
    return {
      completion,
      fallbackNotice: discoveredUnsupported ? this.structuredOutputFallbackNotice() : undefined,
    }
  }

  private async createCaseStream(client: OpenAI, payload: Record<string, unknown>): Promise<{ stream: AsyncIterable<any>; fallbackNotice?: string }> {
    if (this.strictSchemaEnabled()) {
      try {
        const stream = await client.chat.completions.create({
          ...payload,
          stream: true,
          response_format: buildStrictCaseResponseFormat() as any,
        } as any)
        return { stream: stream as unknown as AsyncIterable<any> }
      } catch (err) {
        if (!isStructuredOutputUnsupportedError(err)) throw err
        this.logger.warn(`流式严格 json_schema 输出不可用，回退普通流式: ${(err as Error).message}`)
      }
    }

    try {
      const stream = await client.chat.completions.create({
        ...payload,
        stream: true,
        response_format: buildJsonObjectResponseFormat() as any,
      } as any)
      return {
        stream: stream as unknown as AsyncIterable<any>,
        fallbackNotice: this.structuredOutputFallbackNotice(),
      }
    } catch (err) {
      if (!isStructuredOutputUnsupportedError(err)) throw err
      this.logger.warn(`流式 json_object 输出不可用，回退无 response_format: ${(err as Error).message}`)
      const stream = await client.chat.completions.create({
        ...payload,
        stream: true,
      } as any)
      return {
        stream: stream as unknown as AsyncIterable<any>,
        fallbackNotice: this.structuredOutputFallbackNotice(),
      }
    }
  }

  private async rebuildTruncatedCaseJson(
    client: OpenAI,
    modelId: string,
    originalSystem: string,
    originalUser: string,
    partialText: string,
    maxTokens: number,
  ): Promise<{ content: string; attempts: number; finishReason: string | null; fallbackNotice?: string } | null> {
    let attempts = 0
    let lastFinishReason: string | null = 'length'
    let fallbackNotice: string | undefined
    const maxAttempts = this.continuationMaxAttempts()
    const partialSlice =
      partialText.length > 80_000
        ? `${partialText.slice(0, 45_000)}\n\n...(middle omitted)...\n\n${partialText.slice(-35_000)}`
        : partialText

    while (shouldAttemptContinuation(lastFinishReason, attempts, maxAttempts)) {
      attempts += 1
      try {
        const result = await this.createCaseCompletion(client, {
          model: modelId,
          messages: [
            {
              role: 'system',
              content:
                'You rebuild truncated testcase JSON. Return ONE complete valid JSON object only. The top-level object must be { "cases": [...] }. Preserve all valid cases from the partial output and complete the missing tail from the original request.',
            },
            {
              role: 'user',
              content:
                `原始 system 指令：\n${originalSystem}\n\n` +
                `原始 user 输入：\n${originalUser}\n\n` +
                `已被 max_tokens 截断的部分输出：\n${partialSlice}\n\n` +
                '请基于原始输入重新输出完整 JSON。不要 Markdown，不要解释，不要省略。',
            },
          ],
          temperature: 0,
          max_tokens: maxTokens,
        })
        fallbackNotice = fallbackNotice ?? result.fallbackNotice
        const choice = result.completion.choices?.[0]
        const content = String(choice?.message?.content ?? '').trim()
        lastFinishReason = (choice?.finish_reason as string | undefined) ?? null
        if (content && this.extractCaseRows(content).length > 0) {
          return { content, attempts, finishReason: lastFinishReason, fallbackNotice }
        }
      } catch (e) {
        this.logger.warn(`截断 JSON 自动重建失败: ${(e as Error).message}`)
        return null
      }
    }
    return null
  }

  private async continuePlainTextOutput(
    client: OpenAI,
    modelId: string,
    originalSystem: string,
    originalUser: string,
    partialText: string,
    maxTokens: number,
    onDelta?: (text: string) => void,
  ): Promise<{ content: string; attempts: number; finishReason: string | null; failureReason?: string }> {
    let content = partialText
    let attempts = 0
    let finishReason: string | null = 'length'
    const maxAttempts = this.continuationMaxAttempts()
    let failureReason: string | undefined

    while (shouldAttemptContinuation(finishReason, attempts, maxAttempts)) {
      attempts += 1
      try {
        const messages = buildPlainTextContinuationMessages({
          originalSystem,
          originalUser,
          partialText: content,
        })
        const completion = await client.chat.completions.create({
          model: modelId,
          messages,
          temperature: 0.4,
          max_tokens: maxTokens,
        })
        const choice = completion.choices?.[0]
        const delta = String(choice?.message?.content ?? '')
        finishReason = (choice?.finish_reason as string | undefined) ?? null
        if (!delta.trim()) {
          failureReason = '模型续写返回空内容'
          break
        }
        content += delta
        onDelta?.(delta)
      } catch (e) {
        failureReason = humanizeAiProviderError((e as Error).message || String(e))
        this.logger.warn(`长文本自动续写失败: ${failureReason}`)
        break
      }
    }

    return { content, attempts, finishReason, failureReason }
  }

  private mapRowToCaseInput(c: any): Prisma.TestCaseCreateWithoutSuiteInput {
    const rawObj = c && typeof c === 'object' ? (c as Record<string, unknown>) : ({} as Record<string, unknown>)
    const n = normalizeCaseRowForPersistence(rawObj)
    const preserved = Array.isArray((c as any)?.tags) ? (c as any).tags.map((x: unknown) => String(x)).filter((t: string) => t === 'ai-raw-output' || t === 'ai-parsed-markdown') : []
    const tags = [...new Set([...n.tags, ...preserved])]
    const pr = String(n.priority).toUpperCase()
    const priority = (['P0', 'P1', 'P2', 'P3'].includes(pr) ? pr : 'P2') as TestCasePriority
    const ty = String(n.type).toUpperCase()
    const type = (['FUNCTIONAL', 'PERFORMANCE', 'SECURITY', 'COMPATIBILITY', 'REGRESSION'].includes(ty) ? ty : 'FUNCTIONAL') as TestCaseType
    return {
      title: String(n.title).slice(0, 500),
      precondition: n.precondition != null ? String(n.precondition) : undefined,
      description: n.description != null ? String(n.description) : undefined,
      steps: n.steps as Prisma.InputJsonValue,
      expectedResult: String(n.expectedResult),
      priority,
      type,
      tags,
    }
  }

  /** 启发式拆条结果若仍像「整段塞进一条」，则继续走原文兜底 */
  private shouldUseLooseParsedCases(loose: { expectedResult: string }[], raw: string): boolean {
    if (loose.length === 0) return false
    if (loose.length >= 2) return true
    const r = raw.trim()
    if (r.length > 600 && loose[0].expectedResult.length > r.length * 0.88) return false
    return true
  }

  private resolveCasesForPersistence(fullText: string): any[] {
    const rows = this.extractCaseRows(fullText)
    if (rows.length > 0) return rows
    const loose = parseLooseMarkdownToCaseRows(fullText)
    if (this.shouldUseLooseParsedCases(loose, fullText)) return loose as any[]
    const fallback = this.fallbackCasesFromRawOutput(fullText)
    if (fallback.length > 0) return fallback
    return []
  }

  /**
   * 带“修复”能力的解析：先尝试 JSON → 失败则二次修复 → 再启发式拆分 → 最后原文兜底。
   */
  private async resolveCasesForPersistenceWithRepair(
    client: OpenAI,
    modelId: string,
    rawText: string,
  ): Promise<{
    rows: any[]
    repaired: boolean
    outputTruncated: boolean
    schemaRepaired: boolean
    schemaValidationWarnings: string[]
  }> {
    const direct = this.extractCaseRows(rawText)
    if (direct.length > 0) {
      const validation = validateCaseRowsAgainstSchema(direct)
      if (validation.ok) {
        return {
          rows: direct,
          repaired: false,
          outputTruncated: false,
          schemaRepaired: false,
          schemaValidationWarnings: [],
        }
      }

      const repairedDirect = await this.tryRepairToJsonObject(client, modelId, rawText, validation.errors)
      if (repairedDirect?.repairedText) {
        const fixed = this.extractCaseRows(repairedDirect.repairedText)
        const fixedValidation = validateCaseRowsAgainstSchema(fixed)
        if (fixed.length > 0 && fixedValidation.ok) {
          return {
            rows: fixed,
            repaired: true,
            outputTruncated: repairedDirect.finishReason === 'length',
            schemaRepaired: true,
            schemaValidationWarnings: validation.errors,
          }
        }
        if (fixed.length > 0) {
          return {
            rows: fixed,
            repaired: true,
            outputTruncated: repairedDirect.finishReason === 'length',
            schemaRepaired: true,
            schemaValidationWarnings: fixedValidation.errors.length ? fixedValidation.errors : validation.errors,
          }
        }
      }

      return {
        rows: direct,
        repaired: false,
        outputTruncated: false,
        schemaRepaired: false,
        schemaValidationWarnings: validation.errors,
      }
    }

    const repaired = await this.tryRepairToJsonObject(client, modelId, rawText)
    if (repaired?.repairedText) {
      const fixed = this.extractCaseRows(repaired.repairedText)
      if (fixed.length > 0) {
        const validation = validateCaseRowsAgainstSchema(fixed)
        return {
          rows: fixed,
          repaired: true,
          outputTruncated: repaired.finishReason === 'length',
          schemaRepaired: true,
          schemaValidationWarnings: validation.ok ? [] : validation.errors,
        }
      }
    }

    const loose = parseLooseMarkdownToCaseRows(rawText)
    if (this.shouldUseLooseParsedCases(loose, rawText)) {
      return {
        rows: loose as any[],
        repaired: false,
        outputTruncated: false,
        schemaRepaired: false,
        schemaValidationWarnings: ['模型未返回 JSON schema 结构，已使用 Markdown 兼容解析。'],
      }
    }

    const fallback = this.fallbackCasesFromRawOutput(rawText)
    return {
      rows: fallback,
      repaired: false,
      outputTruncated: false,
      schemaRepaired: false,
      schemaValidationWarnings: fallback.length ? ['模型输出无法满足用例 schema，已保存原文占位记录。'] : [],
    }
  }

  /** 生成成功且指定了模板时，增加模板使用次数 */
  private async bumpTemplateUsage(templateId?: string) {
    const id = templateId?.trim()
    if (!id) return
    try {
      const n = await this.prisma.promptTemplate.updateMany({
        where: { id },
        data: { usageCount: { increment: 1 } },
      })
      if (n.count === 0) {
        this.logger.warn(`模板使用计数跳过：模板 id 不存在 ${id}`)
      }
    } catch (e) {
      this.logger.warn(`模板使用计数更新失败: ${id}`, e as Error)
    }
  }

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private readonly multimodal: MultimodalService,
    private readonly reviews: ReviewsService,
  ) {}

  /** 环境级混元 OpenAI 多模态（HUNYUAN_MULTIMODAL_ENABLED + HUNYUAN_VISION_API_KEY） */
  private hunyuanMultimodalEnvReady(): boolean {
    if (!isHunyuanMultimodalEnabled(this.config)) return false
    if (!resolveHunyuanVisionApiKey(this.config)) return false
    return true
  }

  private async bootstrapReviewsSafe(recordId: string, suiteId: string, userId: string) {
    try {
      await this.reviews.bootstrapForRecord(recordId, suiteId, userId)
    } catch (e) {
      this.logger.warn(`评审数据初始化失败: ${(e as Error).message}`)
    }
  }

  private isOnlyAiRawOutputRows(rows: any[]): boolean {
    return rows.length > 0 && rows.every((r: any) => Array.isArray(r?.tags) && (r.tags as string[]).includes('ai-raw-output'))
  }

  private buildQualityReport(dto: GenerateDto, fileContent: string | undefined, rows: any[]) {
    const sourceText = [dto.text, fileContent, dto.flowchartContext, dto.customPrompt]
      .map((item) => (typeof item === 'string' ? item.trim() : ''))
      .filter(Boolean)
      .join('\n\n')
    return buildAiOutputQualityReport(sourceText, rows)
  }

  private autoRepairScoreThreshold(): number {
    const raw = Number(this.config.get<string>('AI_AUTO_REPAIR_SCORE_THRESHOLD') ?? '80')
    if (!Number.isFinite(raw)) return 80
    return Math.min(100, Math.max(0, Math.floor(raw)))
  }

  private async maybeAutoRepairGeneratedRecord(
    recordId: string,
    userId: string,
    qualityReport: ReturnType<typeof buildAiOutputQualityReport>,
  ) {
    if (!shouldAutoRepairQuality(qualityReport, this.autoRepairScoreThreshold())) return null

    try {
      const result = await this.runRequirementCaseClosedLoop(recordId, userId)
      if (result.actions.length === 0) return null
      return result
    } catch (e) {
      this.logger.warn(`自动质量修复跳过: ${(e as Error).message}`)
      return null
    }
  }

  private mapDbCaseToClosedLoopInput(c: { id: string; title: string; priority: TestCasePriority; type: TestCaseType; precondition: string | null; steps: Prisma.JsonValue; expectedResult: string; tags: string[]; description: string | null }) {
    return {
      id: c.id,
      title: c.title,
      priority: c.priority,
      type: c.type,
      precondition: c.precondition ?? '',
      steps: Array.isArray(c.steps) ? c.steps : [],
      expectedResult: c.expectedResult,
      tags: c.tags,
      description: c.description ?? undefined,
    }
  }

  private mapClosedLoopCaseToUpdateInput(c: ClosedLoopCase): Prisma.TestCaseUpdateInput {
    const normalized = normalizeCaseRowForPersistence(c as unknown as Record<string, unknown>)
    const priority = normalized.priority as TestCasePriority
    const type = normalized.type as TestCaseType
    return {
      title: normalized.title,
      precondition: normalized.precondition ?? null,
      description: normalized.description ?? null,
      steps: normalized.steps as Prisma.InputJsonValue,
      expectedResult: normalized.expectedResult,
      priority,
      type,
      tags: normalized.tags,
    }
  }

  private mapClosedLoopCaseToCreateInput(c: ClosedLoopCase): Prisma.TestCaseCreateWithoutSuiteInput {
    const normalized = normalizeCaseRowForPersistence(c as unknown as Record<string, unknown>)
    return this.mapRowToCaseInput(normalized)
  }

  private closedLoopComment(action: ClosedLoopMutation, beforeScore: number, afterScore: number) {
    const prefix = action.type === 'add_missing_requirement' ? 'AI 闭环补齐' : action.type === 'mark_duplicate' ? 'AI 闭环标记重复' : 'AI 闭环优化'
    const requirement = action.requirement ? `\n关联需求：${action.requirement}` : ''
    return `${prefix}：${action.reason}${requirement}\n质量评分：${beforeScore} -> ${afterScore}`
  }

  private closedLoopSummary(action: ClosedLoopMutation) {
    if (action.type === 'add_missing_requirement') return `AI 闭环补齐：${action.requirement ?? action.case.title}`
    if (action.type === 'mark_duplicate') return `AI 闭环标记重复：${action.reason}`
    return `AI 闭环优化：${action.reason}`
  }

  /** 落库时的团队、来源枚举、参数快照与模板全文 */
  private async buildRecordPersistExtras(dto: GenerateDto, userId: string) {
    const [u, tpl] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { teamId: true },
      }),
      dto.templateId
        ? this.prisma.promptTemplate.findUnique({
            where: { id: dto.templateId },
            select: { content: true, version: true },
          })
        : Promise.resolve(null),
    ])
    const generationSource = dto.templateId ? GenerationSource.TEMPLATE : dto.fileId ? GenerationSource.FILE_PARSE : GenerationSource.MANUAL_INPUT
    const demand = dto.customPrompt || ''
    const generateParams: Prisma.InputJsonValue = {
      sourceType: dto.sourceType,
      temperature: dto.temperature ?? null,
      maxTokens: dto.maxTokens ?? null,
    }
    return {
      teamId: u?.teamId ?? null,
      generationSource,
      demandContent: demand,
      generateParams,
      promptTemplateSnapshot: tpl?.content ?? null,
      promptTemplateVersion: tpl?.version ?? null,
    }
  }

  /** 根据配置获取 OpenAI 客户端（兼容多模型）。configId 为库中记录 id，纯环境变量回退时为 null。 */
  private async getOpenAIClient(modelConfigId?: string): Promise<{
    client: OpenAI
    modelId: string
    modelName: string
    configId: string | null
  }> {
    let baseUrl = ''
    let apiKey = ''
    let modelId = ''
    let modelName = ''
    let configId: string | null = null

    if (modelConfigId) {
      this.logger.log(`查找模型配置: modelConfigId=${modelConfigId}`)
      const config = await this.prisma.aIModelConfig.findUnique({
        where: { id: modelConfigId },
      })
      if (!config || !config.isActive) {
        throw new BadRequestException('指定模型不存在或已归档，请在系统设置中选择可用模型')
      }
      configId = config.id
      baseUrl = config.baseUrl
      apiKey = config.apiKey
      modelId = config.modelId
      modelName = config.name
      this.logger.log(`找到模型配置: id=${configId}, name=${modelName}, modelId=${modelId}`)
    } else {
      const defaultModel = await this.prisma.aIModelConfig.findFirst({
        where: { isDefault: true, isActive: true },
      })
      if (!defaultModel) {
        throw new BadRequestException('未配置默认分析模型，请在系统设置中先配置并启用一个默认模型')
      }
      configId = defaultModel.id
      baseUrl = defaultModel.baseUrl
      apiKey = defaultModel.apiKey
      modelId = defaultModel.modelId
      modelName = defaultModel.name
      this.logger.log(`使用默认模型: id=${configId}, name=${modelName}, modelId=${modelId}`)
    }

    if (!apiKey || apiKey === 'placeholder') {
      throw new BadRequestException('分析模型 API Key 未配置，请在系统设置中完善模型密钥')
    }

    const client = new OpenAI({ apiKey, baseURL: baseUrl })
    return { client, modelId, modelName, configId }
  }

  /** 获取可用模型列表 */
  async getModels() {
    const models = await this.prisma.aIModelConfig.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        provider: true,
        modelId: true,
        baseUrl: true,
        isDefault: true,
        maxTokens: true,
        temperature: true,
        supportsVision: true,
        useForDocumentVisionParse: true,
      },
    })
    return models
  }

  async runRequirementCaseClosedLoop(recordId: string, userId: string) {
    const record = await this.prisma.generationRecord.findFirst({
      where: { id: recordId, creatorId: userId, deletedAt: null },
      include: {
        file: { select: { parsedContent: true } },
        suite: {
          include: {
            cases: { orderBy: { createdAt: 'asc' } },
          },
        },
      },
    })
    if (!record) throw new BadRequestException('生成记录不存在或无权访问')
    if (!record.suiteId || !record.suite) throw new BadRequestException('该记录没有可优化的用例集')
    if (!record.suite.cases.length) throw new BadRequestException('该记录暂无可优化用例')

    await this.bootstrapReviewsSafe(record.id, record.suiteId, userId)

    const requirementText = record.demandContent?.trim() || record.prompt?.trim() || record.file?.parsedContent?.trim() || record.promptTemplateSnapshot?.trim() || ''
    const beforeRows = record.suite.cases.map((c) => this.mapDbCaseToClosedLoopInput(c))
    const beforeReport = buildAiOutputQualityReport(requirementText, beforeRows)
    const plan = buildClosedLoopPlan({
      requirementText,
      cases: beforeRows,
      qualityReport: beforeReport,
    })

    if (plan.actions.length === 0) {
      return {
        recordId: record.id,
        suiteId: record.suiteId,
        beforeScore: beforeReport.score,
        afterScore: beforeReport.score,
        addedCount: 0,
        updatedCount: 0,
        duplicateMarkedCount: 0,
        cases: record.suite.cases,
        qualityReport: beforeReport,
        actions: [],
        summary: '当前用例质量检查未发现需要 AI 闭环修订的问题。',
      }
    }

    const simulatedRows = [
      ...beforeRows.map((row) => {
        const mutation = [...plan.updates, ...plan.duplicateMarks].find((item) => item.caseId === row.id)
        return mutation ? mutation.case : row
      }),
      ...plan.additions.map((item) => item.case),
    ]
    const afterReport = buildAiOutputQualityReport(requirementText, simulatedRows)

    await this.prisma.$transaction(async (tx) => {
      const currentCases = await tx.testCase.findMany({
        where: { suiteId: record.suiteId! },
        orderBy: { createdAt: 'asc' },
      })
      const caseMap = new Map(currentCases.map((c) => [c.id, c]))
      const reviews = await tx.testCaseReview.findMany({
        where: { recordId: record.id },
      })
      const reviewMap = new Map(reviews.map((r) => [r.caseId, r]))

      for (const action of [...plan.updates, ...plan.duplicateMarks]) {
        if (!action.caseId) continue
        const existing = caseMap.get(action.caseId)
        const review = reviewMap.get(action.caseId)
        if (!existing || !review) continue
        const nextVersion = review.currentVersionNumber + 1
        const updated = await tx.testCase.update({
          where: { id: action.caseId },
          data: this.mapClosedLoopCaseToUpdateInput(action.case),
        })
        const snapshot = buildSnapshotFromCase(updated, this.closedLoopSummary(action))
        const version = await tx.testCaseVersion.create({
          data: {
            caseId: action.caseId,
            recordId: record.id,
            versionNumber: nextVersion,
            snapshotJson: snapshot as unknown as Prisma.InputJsonValue,
            sourceType: TestCaseVersionSource.manual_edit,
            changeSummary: this.closedLoopSummary(action).slice(0, 500),
            createdBy: userId,
          },
        })
        const comment = this.closedLoopComment(action, beforeReport.score, afterReport.score)
        await tx.testCaseReview.update({
          where: { caseId: action.caseId },
          data: {
            currentVersionNumber: nextVersion,
            latestComment: comment,
            updatedAt: new Date(),
          },
        })
        await tx.testCaseComment.create({
          data: {
            caseId: action.caseId,
            recordId: record.id,
            versionId: version.id,
            commentType: 'note',
            content: comment,
            createdBy: userId,
          },
        })
      }

      for (const action of plan.additions) {
        const created = await tx.testCase.create({
          data: {
            ...this.mapClosedLoopCaseToCreateInput(action.case),
            suite: { connect: { id: record.suiteId! } },
          },
        })
        const snapshot = buildSnapshotFromCase(created, this.closedLoopSummary(action))
        const review = await tx.testCaseReview.create({
          data: {
            recordId: record.id,
            caseId: created.id,
            reviewStatus: 'pending_review',
            currentVersionNumber: 1,
            latestComment: this.closedLoopComment(action, beforeReport.score, afterReport.score),
          },
        })
        const version = await tx.testCaseVersion.create({
          data: {
            caseId: created.id,
            recordId: record.id,
            versionNumber: 1,
            snapshotJson: snapshot as unknown as Prisma.InputJsonValue,
            sourceType: TestCaseVersionSource.manual_edit,
            changeSummary: this.closedLoopSummary(action).slice(0, 500),
            createdBy: userId,
          },
        })
        await tx.testCaseComment.create({
          data: {
            caseId: created.id,
            recordId: record.id,
            versionId: version.id,
            commentType: 'note',
            content: this.closedLoopComment(action, beforeReport.score, afterReport.score),
            createdBy: userId,
          },
        })
        reviewMap.set(created.id, review)
      }

      await tx.generationRecord.update({
        where: { id: record.id },
        data: {
          caseCount: currentCases.length + plan.additions.length,
          notes: [record.notes?.trim(), `AI 闭环优化：新增 ${plan.additions.length} 条，修订 ${plan.updates.length} 条，标记重复 ${plan.duplicateMarks.length} 条；评分 ${beforeReport.score} -> ${afterReport.score}`].filter(Boolean).join('\n'),
        },
      })
    })

    await this.reviews.recomputeRecordReviewStatus(record.id)

    const finalCases = await this.prisma.testCase.findMany({
      where: { suiteId: record.suiteId },
      orderBy: { createdAt: 'asc' },
    })
    const finalRows = finalCases.map((c) => this.mapDbCaseToClosedLoopInput(c))
    const qualityReport = buildAiOutputQualityReport(requirementText, finalRows)
    const summary = `AI 闭环完成：新增 ${plan.additions.length} 条，修订 ${plan.updates.length} 条，标记重复 ${plan.duplicateMarks.length} 条；评分 ${beforeReport.score} -> ${qualityReport.score}`

    return {
      recordId: record.id,
      suiteId: record.suiteId,
      beforeScore: beforeReport.score,
      afterScore: qualityReport.score,
      addedCount: plan.additions.length,
      updatedCount: plan.updates.length,
      duplicateMarkedCount: plan.duplicateMarks.length,
      cases: finalCases,
      qualityReport,
      actions: plan.actions.map((action) => ({
        type: action.type,
        caseId: action.caseId ?? null,
        caseTitle: action.case.title,
        requirement: action.requirement ?? null,
        reason: action.reason,
      })),
      summary,
    }
  }

  /** 管理用途：测试指定模型连通性（小请求，返回延迟与回包片段）；成功/失败均写入 DB 观测字段（若有对应配置行） */
  async testModelConnectivity(opts?: { modelConfigId?: string; prompt?: string }) {
    const { client, modelId, modelName, configId } = await this.getOpenAIClient(opts?.modelConfigId)
    const prompt = (opts?.prompt || '').trim() || '请回复一个单词：ok'

    const persistFailure = async (message: string) => {
      if (!configId) return
      const lastTestError = message.slice(0, 500)
      await this.prisma.aIModelConfig.update({
        where: { id: configId },
        data: {
          lastTestAt: new Date(),
          lastTestOk: false,
          lastTestLatencyMs: null,
          lastTestError,
        },
      })
    }

    const start = Date.now()
    try {
      const completion = await client.chat.completions.create({
        model: modelId,
        messages: [
          { role: 'system', content: 'You are a concise assistant.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0,
        max_tokens: 16,
      })
      const latencyMs = Date.now() - start
      const content = completion.choices?.[0]?.message?.content ?? ''
      if (configId) {
        await this.prisma.aIModelConfig.update({
          where: { id: configId },
          data: {
            lastTestAt: new Date(),
            lastTestOk: true,
            lastTestLatencyMs: latencyMs,
            lastTestError: null,
          },
        })
      }
      return {
        ok: true,
        modelId,
        modelName,
        latencyMs,
        sample: String(content).slice(0, 200),
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : typeof err === 'string' ? err : JSON.stringify(err)
      await persistFailure(message)
      throw err
    }
  }

  async evaluatePromptTemplate(opts: {
    templateId: string
    templateName: string
    templateVersion: number
    content: string
    modelConfigId?: string
    sampleLimit?: number
    temperature?: number
    maxTokens?: number
    onProgress?: (event: PromptEvaluationProgressEvent) => void
  }) {
    const { client, modelId, modelName } = await this.getOpenAIClient(opts.modelConfigId)
    const sampleLimit = Math.min(Math.max(Math.floor(opts.sampleLimit || 3), 1), PROMPT_EVAL_SAMPLE_SET.length)
    const temperature = opts.temperature ?? 0.2
    const maxTokens = this.effectiveMaxTokens(resolvePromptEvaluationMaxTokens(opts.maxTokens))
    opts.onProgress?.({ stage: 'format_check', progress: 5, message: '开始 Prompt 格式体检' })
    const promptAnalysis = analyzePromptTemplateFormat(opts.content)
    opts.onProgress?.({ stage: 'original_evaluation', progress: 10, message: '开始原版 Prompt 样例评测' })
    const report = await this.evaluatePromptTemplateContent({
      client,
      modelId,
      modelName,
      templateId: opts.templateId,
      templateName: opts.templateName,
      templateVersion: opts.templateVersion,
      content: opts.content,
      sampleLimit,
      temperature,
      maxTokens,
      progressStage: 'original_evaluation',
      progressBase: 10,
      progressSpan: 35,
      onProgress: opts.onProgress,
    })

    report.promptAnalysis = promptAnalysis

    if (!report.skippedReason) {
      opts.onProgress?.({ stage: 'ai_optimization', progress: 50, message: '调用 AI 生成完整优化版 Prompt 草稿' })
      const optimization = await this.optimizePromptTemplateWithAi(client, modelId, opts.content, promptAnalysis.summary)
      report.promptOptimization = optimization
      opts.onProgress?.({ stage: 'guardrail_check', progress: 62, message: '执行优化版 Prompt 守护校验' })
      const hasFailedGuardrail = optimization.guardrails.some((item) => item.status === 'fail')
      if (optimization.status === 'completed' && optimization.optimizedContent && !hasFailedGuardrail) {
        opts.onProgress?.({ stage: 'optimized_evaluation', progress: 65, message: '开始 AI 优化版 Prompt 样例评测' })
        const optimizedEvaluation = await this.evaluatePromptTemplateContent({
          client,
          modelId,
          modelName,
          templateId: opts.templateId,
          templateName: `${opts.templateName}（AI 优化版草稿）`,
          templateVersion: opts.templateVersion,
          content: optimization.optimizedContent,
          sampleLimit,
          temperature,
          maxTokens,
          progressStage: 'optimized_evaluation',
          progressBase: 65,
          progressSpan: 30,
          onProgress: opts.onProgress,
        })
        report.optimizedEvaluation = optimizedEvaluation
        opts.onProgress?.({ stage: 'comparison', progress: 98, message: '生成原版与优化版指标对比' })
        report.comparison = buildPromptEvaluationComparison(report, optimizedEvaluation)
      }
    }

    return report
  }

  private async evaluatePromptTemplateContent(opts: {
    client: OpenAI
    modelId: string
    modelName: string
    templateId: string
    templateName: string
    templateVersion: number
    content: string
    sampleLimit: number
    temperature: number
    maxTokens: number
    progressStage?: 'original_evaluation' | 'optimized_evaluation'
    progressBase?: number
    progressSpan?: number
    onProgress?: (event: PromptEvaluationProgressEvent) => void
  }): Promise<PromptEvaluationReport> {
    const samples = PROMPT_EVAL_SAMPLE_SET.slice(0, opts.sampleLimit)
    const temperature = opts.temperature
    const maxTokens = opts.maxTokens
    const results: PromptEvalSampleResult[] = []
    const compatibility = detectPromptEvaluationCompatibility(opts.content)

    if (!compatibility.compatible) {
      return {
        ...buildPromptEvaluationSummary({
          templateId: opts.templateId,
          templateName: opts.templateName,
          templateVersion: opts.templateVersion,
          modelId: opts.modelId,
          modelName: opts.modelName,
          params: { temperature, maxTokens },
          samples: [],
        }),
        skippedReason: compatibility.reason,
      }
    }

    for (const sample of samples) {
      const index = results.length
      const base = opts.progressBase ?? 0
      const span = opts.progressSpan ?? 0
      const startProgress = base + Math.round((index / Math.max(samples.length, 1)) * span)
      opts.onProgress?.({
        stage: opts.progressStage,
        progress: startProgress,
        message: `${sample.title} 评测中（${index + 1}/${samples.length}）`,
      })
      const startedAt = Date.now()
      const warnings: string[] = []
      try {
        const dto = {
          sourceType: 'text',
          text: sample.requirementText,
          customPrompt: buildPromptEvaluationRuntimePrompt(opts.content),
          temperature,
          maxTokens,
        } as GenerateDto
        const { system, user, inputNotices } = this.buildPromptMessages(dto)
        warnings.push(...inputNotices)
        const { completion, fallbackNotice } = await this.createCaseCompletion(opts.client, {
          model: opts.modelId,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
          temperature,
          max_tokens: maxTokens,
        })
        if (fallbackNotice) warnings.push(fallbackNotice)
        const choice = completion.choices?.[0]
        let finishReason = (choice?.finish_reason as string | undefined) ?? null
        let content = String(choice?.message?.content ?? '').trim()
        if (finishReason === 'length') {
          const rebuilt = await this.rebuildTruncatedCaseJson(opts.client, opts.modelId, system, user, content, maxTokens)
          if (rebuilt) {
            content = rebuilt.content
            finishReason = rebuilt.finishReason
            warnings.push(`模型输出触达最大 Token 后已自动重建完整 JSON（续写 ${rebuilt.attempts} 次）。`)
            if (rebuilt.fallbackNotice) warnings.push(rebuilt.fallbackNotice)
          }
          if (finishReason === 'length') warnings.push(OUTPUT_TRUNCATED_NOTICE)
        }
        const resolved = await this.resolveCasesForPersistenceWithRepair(opts.client, opts.modelId, content)
        if (resolved.repaired) warnings.push('模型原始输出未按 JSON 返回，已自动进行二次整理。')
        if (resolved.schemaRepaired || resolved.schemaValidationWarnings.length > 0) {
          warnings.push(this.schemaRepairNotice(resolved.schemaValidationWarnings))
        }
        const parsed = resolved.rows.length > 0 && !this.isOnlyAiRawOutputRows(resolved.rows)
        const qualityReport = parsed
          ? this.buildQualityReport(dto, sample.requirementText, resolved.rows)
          : null
        results.push({
          sampleId: sample.id,
          title: sample.title,
          parsed,
          caseCount: parsed ? resolved.rows.length : 0,
          qualityScore: qualityReport?.score ?? 0,
          coverageRate: qualityReport?.coverageRate ?? null,
          durationMs: Date.now() - startedAt,
          warnings,
          error: parsed ? undefined : this.emptyOutputUserMessage(),
        })
        const doneProgress = base + Math.round(((index + 1) / Math.max(samples.length, 1)) * span)
        opts.onProgress?.({
          stage: opts.progressStage,
          progress: doneProgress,
          message: `${sample.title} 评测完成（${index + 1}/${samples.length}）`,
        })
      } catch (err) {
        const message = humanizeAiProviderError(err instanceof Error ? err.message : String(err))
        results.push({
          sampleId: sample.id,
          title: sample.title,
          parsed: false,
          caseCount: 0,
          qualityScore: 0,
          coverageRate: null,
          durationMs: Date.now() - startedAt,
          warnings,
          error: message,
        })
        const doneProgress = base + Math.round(((index + 1) / Math.max(samples.length, 1)) * span)
        opts.onProgress?.({
          stage: opts.progressStage,
          progress: doneProgress,
          message: `${sample.title} 评测失败（${index + 1}/${samples.length}）`,
        })
      }
    }

    return buildPromptEvaluationSummary({
      templateId: opts.templateId,
      templateName: opts.templateName,
      templateVersion: opts.templateVersion,
      modelId: opts.modelId,
      modelName: opts.modelName,
      params: { temperature, maxTokens },
      samples: results,
    })
  }

  private extractPromptOptimizationPayload(raw: string): { optimizedContent?: string; reasons: string[] } {
    const text = String(raw ?? '').trim()
    if (!text) return { reasons: [] }
    const parse = (value: string) => {
      try {
        return JSON.parse(value) as Record<string, unknown>
      } catch {
        return null
      }
    }
    let parsed = parse(text)
    if (!parsed) {
      const start = text.indexOf('{')
      const end = text.lastIndexOf('}')
      if (start >= 0 && end > start) parsed = parse(text.slice(start, end + 1))
    }
    if (!parsed) return { reasons: [] }
    const optimizedContent =
      typeof parsed.optimizedContent === 'string'
        ? parsed.optimizedContent.trim()
        : typeof parsed.optimized_prompt === 'string'
          ? parsed.optimized_prompt.trim()
          : typeof parsed.prompt === 'string'
            ? parsed.prompt.trim()
            : undefined
    const reasonsRaw = parsed.reasons ?? parsed.changes ?? parsed.suggestions
    const reasons = Array.isArray(reasonsRaw)
      ? reasonsRaw.map((item) => String(item).trim()).filter(Boolean)
      : typeof reasonsRaw === 'string'
        ? reasonsRaw
            .split(/\n+|[；;]/)
            .map((item) => item.trim())
            .filter(Boolean)
        : []
    return { optimizedContent, reasons: reasons.slice(0, 12) }
  }

  private async optimizePromptTemplateWithAi(
    client: OpenAI,
    modelId: string,
    originalPrompt: string,
    localAnalysisSummary: string,
  ): Promise<PromptOptimizationDraft> {
    try {
      const completion = await client.chat.completions.create({
        model: modelId,
        temperature: 0.2,
        max_tokens: this.effectiveMaxTokens(),
        response_format: buildJsonObjectResponseFormat() as any,
        messages: [
          {
            role: 'system',
            content:
              '你是资深测试架构师与 Prompt 工程评审专家。你必须只输出 JSON 对象，不要输出 Markdown。你要在不破坏原 Prompt 结构、语气、变量和正式生成规则的前提下，生成完整优化版 Prompt。',
          },
          {
            role: 'user',
            content: `
请分析并优化下面的测试用例生成 Prompt。

必须遵守：
1. 不要覆盖原模板，返回一个完整的 optimizedContent 字符串。
2. 必须保留原 Prompt 的章节结构和核心业务约束。
3. 必须保留 {{content}}、原有可配置变量、正式生成数量底线和上传专项覆盖要求。
4. 只能新增或增强：Prompt 评测模式、输出前自检、JSON schema 强约束、字段缺失自修复、steps 与 expectedResult 对齐校验。
5. 正式生成时仍执行原 Prompt 的 20/30/35/45 等数量要求；仅在 Prompt 评测模式下降低为 6-10 条代表性用例。
6. 输出 JSON 对象格式：
{
  "reasons": ["修改原因1", "修改原因2"],
  "optimizedContent": "完整优化版 Prompt，必须包含原 Prompt 主要内容"
}

本地格式分析摘要：
${localAnalysisSummary}

原 Prompt：
${originalPrompt}
`.trim(),
          },
        ],
      } as any)

      const choice = completion.choices?.[0]
      if (choice?.finish_reason === 'length') {
        return {
          status: 'failed',
          reasons: [],
          guardrails: [],
          error: 'AI 优化 Prompt 输出达到最大 Token 上限，未生成完整优化版。请提高模型 maxTokens 或缩短模板后重试。',
        }
      }
      const parsed = this.extractPromptOptimizationPayload(String(choice?.message?.content ?? '').trim())
      if (!parsed.optimizedContent) {
        return {
          status: 'failed',
          reasons: parsed.reasons,
          guardrails: [],
          error: 'AI 未返回 optimizedContent，无法生成完整优化版 Prompt。',
        }
      }
      const guardrails = validateOptimizedPromptDraft(originalPrompt, parsed.optimizedContent)
      const failed = guardrails.filter((item) => item.status === 'fail')
      return {
        status: failed.length > 0 ? 'failed' : 'completed',
        optimizedContent: parsed.optimizedContent,
        reasons: parsed.reasons.length > 0 ? parsed.reasons : ['基于原 Prompt 增加评测模式、输出前自检和结构化约束。'],
        guardrails,
        ...(failed.length > 0
          ? { error: `AI 优化版未通过守护校验：${failed.map((item) => item.label).join('、')}` }
          : {}),
      }
    } catch (err) {
      return {
        status: 'failed',
        reasons: [],
        guardrails: [],
        error: humanizeAiProviderError(err instanceof Error ? err.message : String(err)),
      }
    }
  }

  /** 构建 system / user 消息；过长用户内容自动首尾压缩，避免超出上下文 */
  private buildPromptMessages(
    dto: GenerateDto,
    fileContent?: string,
  ): {
    system: string
    user: string
    inputNotices: string[]
  } {
    const systemPrompt = `你是「测试用例生成专家」：细致、严谨，熟悉等价类、边界值、场景法与错误推测，输出可执行、可评审、可追溯的用例。

【编写原则】准确性、可执行性、用例相互独立、可重复验证；步骤一步一个动作；预期结果与步骤可一一对应（导出为表格时步骤列用 [1][2] 编号，预期列同样编号对应）。

【与 Excel 导出六列严格对齐】每条用例对应一行，字段映射：
- title → 用例名称（例：登录-正确邮箱密码登录成功）
- module → 所属模块（例：用户注册登录）；tags 也至少含一项「模块:模块名」（例：模块:用户注册登录）；其余为标签列，用短词：UI、功能、场景、异常 等（不要用长句）
- precondition → 前置条件：多条时请用「1. …\\n2. …」编号分行
- steps → 步骤描述：order 从 1 连续递增；每步 action 只写一个动作（对应导出单元格内 [1][2] 列表）
- expectedResult → 预期结果：必须与步骤条数一致，格式强制为「[1] …\\n[2] …」，第 n 条对应第 n 步
- priority / riskLevel / type → priority 为 P0–P3；riskLevel 为 high/medium/low；type 为枚举；平台会把 FUNCTIONAL 映射为标签「功能」若未写
- mermaid → 当前用例关联流程图。若能表达流程，输出合法 Mermaid flowchart 文本，不要代码围栏；无流程图时必须为 null

【输出硬性要求】
1. 只输出一个合法 JSON 对象，不要 Markdown、代码围栏、文前文末解释；第一个非空白字符必须是 {。
2. 顶层必须有 "cases" 数组；每条业务场景单独一个对象，禁止把多条用例塞进一条的 expectedResult 长文。
3. 禁止输出 **加粗标题**、### 标题、或「- 优先级:」这类非 JSON 叙述；一律用字段表达。
4. 每条用例必须包含 title, module, priority, riskLevel, type, precondition, steps, expectedResult, tags, mermaid。
5. steps 的每一步必须包含 order, action, expected；expected 没有单步预期时填空字符串，不允许缺字段。
6. 材料过长时优先 P0/P1 与核心主流程，控制单字段篇幅。

示例（与下表一致；注意 expectedResult 与 steps 条数相同且均为 [n]）：
{
  "cases": [
    {
      "title": "登录-正确邮箱密码登录成功",
      "module": "用户注册登录",
      "priority": "P0",
      "riskLevel": "high",
      "type": "FUNCTIONAL",
      "precondition": "1. 用户已有注册账号\\n2. 用户未登录",
      "steps": [
        {"order": 1, "action": "在邮箱和密码输入框输入正确信息", "expected": ""},
        {"order": 2, "action": "点击「登录」按钮", "expected": ""}
      ],
      "expectedResult": "[1] 信息输入校验通过\\n[2] 登录成功，跳转至主页",
      "tags": ["模块:用户注册登录", "UI", "功能"],
      "mermaid": "flowchart TD\\nA[输入邮箱密码] --> B[点击登录]\\nB --> C[进入主页]"
    }
  ]
}`

    let userContent = dto.customPrompt || '请生成全面的测试用例，覆盖正向、逆向和边界场景。'

    if (fileContent) {
      userContent += `\n\n需求/文档内容：\n${fileContent}`
    } else if (dto.text) {
      userContent += `\n\n需求描述：\n${dto.text}`
    }

    const flowchartContext = this.resolveFlowchartPromptContext(dto, fileContent)
    if (flowchartContext) {
      userContent += `\n\n流程图上下文：\n${flowchartContext}\n\n流程图生成约束：\n1. 按主流程顺序生成 P0/P1 核心用例，步骤必须覆盖关键流程节点。\n2. 针对每条判断分支生成至少 1 条用例，尤其覆盖「否/失败/异常/驳回/无权限/超时」路径。\n3. 预期结果必须与流程节点逐步对应，expectedResult 使用 [1][2] 编号并与 steps 一一匹配。\n4. 若流程图存在回退、重试、重新编辑路径，必须生成对应的异常或回归用例。`
    }

    const { text, truncated, omittedChars, originalLength } = clampGenerationUserContent(userContent)
    const inputNotices: string[] = []
    if (truncated) {
      this.logger.warn(`生成输入已压缩: 原 ${originalLength} 字符 (≈${roughTokenEstimateFromChars(originalLength)} tokens 粗估), 省略中间 ${omittedChars} 字`)
      inputNotices.push(`${INPUT_CLAMPED_NOTICE_PREFIX}原约 ${originalLength} 字，已省略中间 ${omittedChars} 字（保留首尾）。建议拆分需求、摘要后再生成。`)
    }

    return { system: systemPrompt, user: text, inputNotices }
  }

  private resolveFlowchartPromptContext(dto: GenerateDto, fileContent?: string): string {
    const parts: string[] = []
    if (dto.flowchartContext?.trim()) {
      parts.push(dto.flowchartContext.trim())
    }

    const embedded = this.extractEmbeddedFlowchartSummary(fileContent || dto.text || '')
    if (embedded && !parts.some((part) => part.includes(embedded.slice(0, 120)))) {
      parts.push(embedded)
    }

    return parts
      .join('\n\n')
      .replace(/\n{3,}/g, '\n\n')
      .slice(0, 8000)
      .trim()
  }

  private extractEmbeddedFlowchartSummary(text: string): string {
    const source = (text || '').trim()
    if (!source.includes('## 流程图结构化摘要')) return ''
    const [, summary = ''] = source.split('## 流程图结构化摘要', 2)
    return `## 流程图结构化摘要${summary}`.trim().slice(0, 6000)
  }

  /** 非流式生成 */
  async generate(dto: GenerateDto, userId: string) {
    this.logger.log(`generate: modelConfigId=${dto.modelConfigId}, sourceType=${dto.sourceType}, fileId=${dto.fileId}`)
    const { client, modelId, modelName } = await this.getOpenAIClient(dto.modelConfigId)
    const startTime = Date.now()

    let fileContent: string | undefined
    let fileRow: UploadedFile | null = null
    if (dto.fileId) {
      fileRow = await this.prisma.uploadedFile.findFirst({
        where: { id: dto.fileId, uploaderId: userId },
      })
      if (!fileRow) throw new BadRequestException('文件不存在或无权访问')
      fileContent = fileRow.parsedContent ?? undefined
    }

    const extras = await this.buildRecordPersistExtras(dto, userId)
    const record = await this.prisma.generationRecord.create({
      data: {
        title: `生成记录 ${new Date().toLocaleString('zh-CN')}`,
        status: GenerationStatus.PROCESSING,
        sourceType: dto.sourceType,
        prompt: dto.customPrompt || '',
        demandContent: extras.demandContent,
        generationSource: extras.generationSource,
        generateParams: extras.generateParams,
        promptTemplateSnapshot: extras.promptTemplateSnapshot ?? undefined,
        promptTemplateVersion: extras.promptTemplateVersion ?? undefined,
        teamId: extras.teamId ?? undefined,
        modelId,
        modelName,
        creatorId: userId,
        fileId: dto.fileId,
        templateId: dto.templateId,
      },
    })

    try {
      // 单文件图片/PDF：默认优先混元 hunyuan-vision 端到端 JSON；
      // forceConfiguredModel=true 时跳过该捷径，直接走后台已选模型。
      if (dto.fileId && fileRow && this.hunyuanMultimodalEnvReady() && !dto.forceConfiguredModel) {
        const mime = (fileRow.mimeType || '').toLowerCase()
        const isImgPdf = mime.startsWith('image/') || mime.includes('pdf')
        if (isImgPdf && fileRow.path) {
          try {
            const fk = mime.includes('pdf') ? 'PDF' : 'IMAGE'
            const { text } = await this.multimodal.generateCasesFromFile({
              userId,
              storedPath: fileRow.path,
              localPath: fileRow.path,
              fileKind: fk,
              fileBytes: Number(fileRow.size) || 0,
              customPrompt: dto.customPrompt,
              uploadedFileId: fileRow.id,
              recordId: record.id,
            })
            const resolvedEarly = await this.resolveCasesForPersistenceWithRepair(client, modelId, text)
            if (resolvedEarly.rows.length > 0 && !this.isOnlyAiRawOutputRows(resolvedEarly.rows)) {
              const suite = await this.prisma.testSuite.create({
                data: {
                  name: `AI 生成用例集 - ${new Date().toLocaleString('zh-CN')}`,
                  creatorId: userId,
                  cases: {
                    create: resolvedEarly.rows.map((c: any) => this.mapRowToCaseInput(c)),
                  },
                },
                include: { cases: true },
              })
              const duration = Date.now() - startTime
              await this.prisma.generationRecord.update({
                where: { id: record.id },
                data: {
                  status: GenerationStatus.SUCCESS,
                  caseCount: suite.cases.length,
                  suiteId: suite.id,
                  duration,
                },
              })
              await this.bootstrapReviewsSafe(record.id, suite.id, userId)
              await this.bumpTemplateUsage(dto.templateId)
              const qualityReport = this.buildQualityReport(dto, fileContent, resolvedEarly.rows)
              const autoRepair = await this.maybeAutoRepairGeneratedRecord(record.id, userId, qualityReport)
              const finalCases = autoRepair?.cases ?? suite.cases
              const finalQualityReport = autoRepair?.qualityReport ?? qualityReport
              const warnings: string[] = ['已使用腾讯云混元 hunyuan-vision（OpenAI 兼容多模态）直接生成用例。']
              if (resolvedEarly.repaired) {
                warnings.push('模型原始输出未按 JSON 返回，已自动进行二次整理后入库。')
              }
              if (resolvedEarly.schemaRepaired || resolvedEarly.schemaValidationWarnings.length > 0) {
                warnings.push(this.schemaRepairNotice(resolvedEarly.schemaValidationWarnings))
              }
              if (resolvedEarly.outputTruncated) warnings.push(OUTPUT_TRUNCATED_NOTICE)
              if (autoRepair) warnings.push(buildAutoRepairNotice(autoRepair))
              return {
                recordId: record.id,
                cases: finalCases,
                duration,
                warnings,
                qualityReport: finalQualityReport,
                ...(autoRepair ? { autoRepair } : {}),
              }
            }
            if (text?.trim()) fileContent = text.trim()
          } catch (e) {
            this.logger.warn(`generate: 混元多模态端到端失败，回退配置模型: ${(e as Error).message}`)
          }
        }
      }

      if (dto.fileId && !fileContent?.trim()) {
        throw new BadRequestException('文件内容尚未解析完成，请稍后重试')
      }

      const { system, user, inputNotices } = this.buildPromptMessages(dto, fileContent)
      const maxOut = this.effectiveMaxTokens(dto.maxTokens)
      const { completion, fallbackNotice } = await this.createCaseCompletion(client, {
        model: modelId,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        temperature: dto.temperature ?? 0.7,
        max_tokens: maxOut,
      })

      const choice = completion.choices[0]
      let content = choice?.message?.content || ''
      let finishReason = choice?.finish_reason ?? null
      const outputWarnings: string[] = []
      if (fallbackNotice) outputWarnings.push(fallbackNotice)
      if (finishReason === 'length') {
        this.logger.warn('非流式生成：模型输出因 max_tokens 被截断')
        const rebuilt = await this.rebuildTruncatedCaseJson(client, modelId, system, user, content, maxOut)
        if (rebuilt) {
          content = rebuilt.content
          finishReason = rebuilt.finishReason
          outputWarnings.push(`模型输出触达最大 Token 后已自动重建完整 JSON（续写 ${rebuilt.attempts} 次）。`)
          if (rebuilt.fallbackNotice) outputWarnings.push(rebuilt.fallbackNotice)
        }
        if (finishReason === 'length') outputWarnings.push(OUTPUT_TRUNCATED_NOTICE)
      }

      const resolved = await this.resolveCasesForPersistenceWithRepair(client, modelId, content)
      const rows = resolved.rows
      if (resolved.repaired) {
        outputWarnings.push('模型原始输出未按 JSON 返回，已自动进行二次整理后入库。')
      }
      if (resolved.schemaRepaired || resolved.schemaValidationWarnings.length > 0) {
        outputWarnings.push(this.schemaRepairNotice(resolved.schemaValidationWarnings))
      }
      if (resolved.outputTruncated) {
        outputWarnings.push(OUTPUT_TRUNCATED_NOTICE)
      }
      if (rows.length === 0) {
        const msg = this.emptyOutputUserMessage({
          outputTruncated: finishReason === 'length',
        })
        await this.prisma.generationRecord.update({
          where: { id: record.id },
          data: {
            status: GenerationStatus.FAILED,
            errorMessage: msg,
            caseCount: 0,
            duration: Date.now() - startTime,
          },
        })
        throw new BadRequestException(msg)
      }

      // 创建用例集和用例
      const suite = await this.prisma.testSuite.create({
        data: {
          name: `AI 生成用例集 - ${new Date().toLocaleString('zh-CN')}`,
          creatorId: userId,
          cases: {
            create: rows.map((c: any) => this.mapRowToCaseInput(c)),
          },
        },
        include: { cases: true },
      })

      const duration = Date.now() - startTime
      const qualityReport = this.buildQualityReport(dto, fileContent, rows)
      await this.prisma.generationRecord.update({
        where: { id: record.id },
        data: {
          status: GenerationStatus.SUCCESS,
          caseCount: suite.cases.length,
          suiteId: suite.id,
          duration,
          tokensUsed: completion.usage?.total_tokens,
        },
      })
      await this.bootstrapReviewsSafe(record.id, suite.id, userId)

      await this.bumpTemplateUsage(dto.templateId)

      const autoRepair = await this.maybeAutoRepairGeneratedRecord(record.id, userId, qualityReport)
      const finalCases = autoRepair?.cases ?? suite.cases
      const finalQualityReport = autoRepair?.qualityReport ?? qualityReport
      const warnings = [...inputNotices, ...outputWarnings].filter(Boolean)
      if (autoRepair) warnings.push(buildAutoRepairNotice(autoRepair))
      return {
        recordId: record.id,
        cases: finalCases,
        tokensUsed: completion.usage?.total_tokens,
        duration,
        qualityReport: finalQualityReport,
        ...(autoRepair ? { autoRepair } : {}),
        ...(warnings.length ? { warnings } : {}),
      }
    } catch (err: unknown) {
      const message = humanizeAiProviderError(err instanceof Error ? err.message : String(err))
      await this.prisma.generationRecord.update({
        where: { id: record.id },
        data: { status: GenerationStatus.FAILED, errorMessage: message },
      })
      throw new BadRequestException(message)
    }
  }

  /** 流式生成（SSE） */
  async generateStream(dto: GenerateDto, userId: string, res: Response) {
    this.logger.log(`generateStream: modelConfigId=${dto.modelConfigId}, sourceType=${dto.sourceType}, fileId=${dto.fileId}`)
    const { client, modelId, modelName } = await this.getOpenAIClient(dto.modelConfigId)
    const startTime = Date.now()

    let fileContent: string | undefined
    let fileRow: UploadedFile | null = null
    if (dto.fileId) {
      fileRow = await this.prisma.uploadedFile.findFirst({
        where: { id: dto.fileId, uploaderId: userId },
      })
      if (!fileRow) throw new BadRequestException('文件不存在或无权访问')
      fileContent = fileRow.parsedContent ?? undefined
    }

    const extras = await this.buildRecordPersistExtras(dto, userId)
    const record = await this.prisma.generationRecord.create({
      data: {
        title: `流式生成记录 ${new Date().toLocaleString('zh-CN')}`,
        status: GenerationStatus.PROCESSING,
        sourceType: dto.sourceType,
        prompt: dto.customPrompt || '',
        demandContent: extras.demandContent,
        generationSource: extras.generationSource,
        generateParams: extras.generateParams,
        promptTemplateSnapshot: extras.promptTemplateSnapshot ?? undefined,
        promptTemplateVersion: extras.promptTemplateVersion ?? undefined,
        teamId: extras.teamId ?? undefined,
        modelId,
        modelName,
        creatorId: userId,
        fileId: dto.fileId,
        templateId: dto.templateId,
      },
    })

    // 设置 SSE 响应头（X-Accel-Buffering 供 Nginx 等反代关闭响应缓冲）
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no')
    res.flushHeaders()

    // 模型两次 token 间隔较长时，部分负载均衡会 idle 断连；SSE 注释行不触发客户端 data 事件
    const keepAliveMs = 15000
    const keepAlive = setInterval(() => {
      if (!res.writableEnded) res.write(': ping\n\n')
    }, keepAliveMs)

    let fullContent = ''
    const maxFullContentChars = this.streamFullContentMaxChars()
    let fullContentTruncated = false
    let streamTruncationNoticeSent = false
    let finishReason: string | null = null
    try {
      // 单文件图片/PDF：默认可走混元多模态直出；
      // forceConfiguredModel=true 时跳过该捷径，始终走后台已选模型流式生成。
      if (dto.fileId && fileRow && this.hunyuanMultimodalEnvReady() && !dto.forceConfiguredModel) {
        const mime = (fileRow.mimeType || '').toLowerCase()
        const isImgPdf = mime.startsWith('image/') || mime.includes('pdf')
        if (isImgPdf && fileRow.path) {
          try {
            const fk = mime.includes('pdf') ? 'PDF' : 'IMAGE'
            const { text } = await this.multimodal.generateCasesFromFile({
              userId,
              storedPath: fileRow.path,
              localPath: fileRow.path,
              fileKind: fk,
              fileBytes: Number(fileRow.size) || 0,
              customPrompt: dto.customPrompt,
              uploadedFileId: fileRow.id,
              recordId: record.id,
            })
            const resolvedEarly = await this.resolveCasesForPersistenceWithRepair(client, modelId, text)
            if (resolvedEarly.rows.length > 0 && !this.isOnlyAiRawOutputRows(resolvedEarly.rows)) {
              const { inputNotices } = this.buildPromptMessages(dto, fileContent)
              for (const n of inputNotices) {
                this.writeStreamNotice(res, n)
              }
              this.writeStreamNotice(res, '已使用腾讯云混元 hunyuan-vision 多模态直接生成用例，未再调用流式模型。')
              if (resolvedEarly.repaired) {
                this.writeStreamNotice(res, '模型原始输出未按 JSON 返回，已自动进行二次整理后入库。')
              }
              if (resolvedEarly.schemaRepaired || resolvedEarly.schemaValidationWarnings.length > 0) {
                this.writeStreamNotice(res, this.schemaRepairNotice(resolvedEarly.schemaValidationWarnings))
              }
              if (resolvedEarly.outputTruncated) {
                this.writeStreamNotice(res, OUTPUT_TRUNCATED_NOTICE)
              }
              const suite = await this.prisma.testSuite.create({
                data: {
                  name: `AI 流式生成用例集 - ${new Date().toLocaleString('zh-CN')}`,
                  creatorId: userId,
                  cases: {
                    create: resolvedEarly.rows.map((c: any) => this.mapRowToCaseInput(c)),
                  },
                },
                include: { cases: true },
              })
              await this.prisma.generationRecord.update({
                where: { id: record.id },
                data: {
                  status: GenerationStatus.SUCCESS,
                  caseCount: suite.cases.length,
                  suiteId: suite.id,
                  duration: Date.now() - startTime,
                },
              })
              await this.bootstrapReviewsSafe(record.id, suite.id, userId)
              await this.bumpTemplateUsage(dto.templateId)
              const qualityReport = this.buildQualityReport(dto, fileContent, resolvedEarly.rows)
              const autoRepair = await this.maybeAutoRepairGeneratedRecord(record.id, userId, qualityReport)
              if (autoRepair) {
                this.writeStreamNotice(res, buildAutoRepairNotice(autoRepair))
              }
              const finalCases = autoRepair?.cases ?? suite.cases
              const finalQualityReport = autoRepair?.qualityReport ?? qualityReport
              res.write(
                `data: ${JSON.stringify({
                  recordId: record.id,
                  suiteId: suite.id,
                  caseCount: finalCases.length,
                  qualityReport: finalQualityReport,
                  ...(autoRepair ? { autoRepair } : {}),
                })}\n\n`,
              )
              res.write(`data: [DONE]\n\n`)
              res.end()
              return
            }
            if (text?.trim()) fileContent = text.trim()
          } catch (e) {
            this.logger.warn(`generateStream: 混元多模态端到端失败，回退流式模型: ${(e as Error).message}`)
          }
        }
      }

      if (dto.fileId && !fileContent?.trim()) {
        throw new BadRequestException('文件内容尚未解析完成')
      }

      const { system, user, inputNotices } = this.buildPromptMessages(dto, fileContent)
      for (const n of inputNotices) {
        this.writeStreamNotice(res, n)
      }

      const maxOut = this.effectiveMaxTokens(dto.maxTokens)
      const { stream, fallbackNotice } = await this.createCaseStream(client, {
        model: modelId,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        temperature: dto.temperature ?? 0.7,
        max_tokens: maxOut,
      })
      if (fallbackNotice) {
        this.writeStreamNotice(res, fallbackNotice)
      }

      for await (const chunk of stream) {
        const ch0 = chunk.choices[0]
        const fr = ch0?.finish_reason
        if (fr) finishReason = fr
        const d = ch0?.delta as { content?: string; reasoning_content?: string } | undefined
        const contentDelta = typeof d?.content === 'string' ? d.content : ''
        const reasoningDelta = typeof d?.reasoning_content === 'string' ? d.reasoning_content : ''
        const streamDelta = contentDelta || reasoningDelta
        const persistDelta = contentDelta || reasoningDelta
        if (streamDelta) {
          if (persistDelta && !fullContentTruncated) {
            const remaining = maxFullContentChars - fullContent.length
            if (remaining > 0) {
              fullContent += persistDelta.slice(0, remaining)
            }
            if (persistDelta.length > remaining) {
              fullContentTruncated = true
              if (!streamTruncationNoticeSent) {
                streamTruncationNoticeSent = true
                this.writeStreamNotice(res, `输出过长，已停止累计完整内容（上限 ${maxFullContentChars} 字符），仍继续实时返回流式结果。建议降低 maxTokens 或拆分需求后重试。`)
              }
            }
          }
          res.write(`data: ${JSON.stringify({ content: streamDelta })}\n\n`)
        }
      }

      if (finishReason === 'length') {
        this.logger.warn('流式生成：模型输出因 max_tokens 被截断')
        const rebuilt = await this.rebuildTruncatedCaseJson(client, modelId, system, user, fullContent, maxOut)
        if (rebuilt) {
          fullContent = rebuilt.content
          finishReason = rebuilt.finishReason
          this.writeStreamNotice(res, `模型输出触达最大 Token 后已自动重建完整 JSON（续写 ${rebuilt.attempts} 次）。`)
          if (rebuilt.fallbackNotice) this.writeStreamNotice(res, rebuilt.fallbackNotice)
        }
        if (finishReason === 'length') this.writeStreamNotice(res, OUTPUT_TRUNCATED_NOTICE)
      }

      if (!fullContent.trim()) {
        this.writeStreamNotice(res, '未收到可用于入库的正式输出（content）。若流式区仅有思考过程，请关闭深度思考或更换模型，并确保最终输出 { "cases": [...] } JSON。')
      } else if (fullContentTruncated) {
        this.writeStreamNotice(res, '正式 JSON 输出可能因长度上限未完整入库；流式日志中的思考过程不会写入用例集。请提高 maxTokens 或缩小范围后重试。')
      }

      const resolved = await this.resolveCasesForPersistenceWithRepair(client, modelId, fullContent)
      const rows = resolved.rows
      if (resolved.repaired) {
        this.writeStreamNotice(res, '模型原始输出未按 JSON 返回，已自动进行二次整理后入库。')
      }
      if (resolved.schemaRepaired || resolved.schemaValidationWarnings.length > 0) {
        this.writeStreamNotice(res, this.schemaRepairNotice(resolved.schemaValidationWarnings))
      }
      if (resolved.outputTruncated) {
        this.writeStreamNotice(res, OUTPUT_TRUNCATED_NOTICE)
      }
      if (fullContentTruncated && !streamTruncationNoticeSent) {
        this.writeStreamNotice(res, `输出过长，已停止累计完整内容（上限 ${maxFullContentChars} 字符），建议降低 maxTokens 或拆分需求。`)
      }
      if (rows.length === 0) {
        const msg = this.emptyOutputUserMessage({
          outputTruncated: finishReason === 'length' || fullContentTruncated,
        })
        await this.prisma.generationRecord.update({
          where: { id: record.id },
          data: {
            status: GenerationStatus.FAILED,
            errorMessage: msg,
            caseCount: 0,
            duration: Date.now() - startTime,
          },
        })
        if (!res.writableEnded) {
          res.write(`data: ${JSON.stringify({ error: msg, recordId: record.id })}\n\n`)
          res.write(`data: [DONE]\n\n`)
          res.end()
        }
        return
      }

      if (rows.length > 0 && rows[0]?.tags?.includes?.('ai-raw-output')) {
        this.writeStreamNotice(res, '模型未输出可解析的 JSON 用例（常见原因：深度思考占满 Token、或仅输出编号场景清单）。已保存 1 条占位记录，请换模型/关思考/强调仅输出 JSON 后重试。')
        this.logger.warn('流式输出未解析为 JSON 用例，已保存为单条原文占位用例')
      } else if (rows.length > 0 && rows.some((r: any) => r?.tags?.includes?.('ai-parsed-markdown'))) {
        this.logger.warn(`流式输出已用 Markdown 启发式拆分为 ${rows.length} 条用例（建议模板中强调仅输出 JSON）`)
      }

      const suite = await this.prisma.testSuite.create({
        data: {
          name: `AI 流式生成用例集 - ${new Date().toLocaleString('zh-CN')}`,
          creatorId: userId,
          cases: { create: rows.map((c: any) => this.mapRowToCaseInput(c)) },
        },
        include: { cases: true },
      })

      await this.prisma.generationRecord.update({
        where: { id: record.id },
        data: {
          status: GenerationStatus.SUCCESS,
          caseCount: suite.cases.length,
          suiteId: suite.id,
          duration: Date.now() - startTime,
        },
      })
      await this.bootstrapReviewsSafe(record.id, suite.id, userId)

      await this.bumpTemplateUsage(dto.templateId)
      const qualityReport = this.buildQualityReport(dto, fileContent, rows)
      const autoRepair = await this.maybeAutoRepairGeneratedRecord(record.id, userId, qualityReport)
      if (autoRepair) {
        this.writeStreamNotice(res, buildAutoRepairNotice(autoRepair))
      }
      const finalCases = autoRepair?.cases ?? suite.cases
      const finalQualityReport = autoRepair?.qualityReport ?? qualityReport

      res.write(
        `data: ${JSON.stringify({
          recordId: record.id,
          suiteId: suite.id,
          caseCount: finalCases.length,
          qualityReport: finalQualityReport,
          ...(autoRepair ? { autoRepair } : {}),
        })}\n\n`,
      )
      res.write(`data: [DONE]\n\n`)
      res.end()
    } catch (err: unknown) {
      const message = humanizeAiProviderError(err instanceof Error ? err.message : String(err))
      await this.prisma.generationRecord.update({
        where: { id: record.id },
        data: { status: GenerationStatus.FAILED, errorMessage: message },
      })
      if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify({ error: message })}\n\n`)
        res.end()
      }
    } finally {
      clearInterval(keepAlive)
    }
  }

  /**
   * 需求分析专用流式 SSE —— 不走测试用例生成管线，不做 JSON 解析，不创建 TestSuite。
   * 完成后仅存一条轻量 GenerationRecord（generationSource = FILE_PARSE / MANUAL_INPUT）。
   */
  async analyzeStream(dto: CreateAnalysisDto, userId: string, res: Response) {
    const extra = dto.additionalFileIds ?? []
    const rawIds = [dto.fileId, ...extra].filter((x): x is string => typeof x === 'string' && x.length > 0)
    const orderedIds = [...new Set(rawIds)]
    this.logger.log(`analyzeStream: sourceType=${dto.sourceType}, fileIds=${orderedIds.join(',') || '(none)'}, modelConfigId=${dto.modelConfigId}`)
    const { client, modelId, modelName } = await this.getOpenAIClient(dto.modelConfigId)
    const startTime = Date.now()

    // 获取文件内容（单文件或多图拼接）
    let fileContent: string | undefined
    if (dto.sourceType === 'file') {
      if (!dto.fileId || orderedIds.length === 0) {
        throw new BadRequestException('请先上传并解析文件后再分析')
      }
      if (orderedIds.length > 5) {
        throw new BadRequestException('一次最多分析 5 个文件')
      }

      const rows = await this.prisma.uploadedFile.findMany({
        where: { id: { in: orderedIds }, uploaderId: userId },
      })
      if (rows.length !== orderedIds.length) {
        throw new ForbiddenException('部分文件不存在或无权访问')
      }

      const byId = new Map(rows.map((r) => [r.id, r]))
      const ordered = orderedIds.map((id) => byId.get(id)!)

      if (ordered.length > 1) {
        for (const f of ordered) {
          if (!f.mimeType.startsWith('image/')) {
            throw new BadRequestException('多文件分析仅支持全部为图片')
          }
        }
      }

      /**
       * 上传解析阶段已对图片/PDF 走混元多模态（见 FilesService.parseFileAsync）。
       * 需求分析流式输出只应用后台所选模型（dto.modelConfigId）；此处默认不再对同一文件二次调用混元。
       * 应急恢复旧行为（解析后仍再在 analyze 里跑一轮混元）：ANALYZE_STREAM_HUNYUAN_WHEN_PARSED=1
       */
      const forceAnalyzeTimeHunyuan = this.config.get<string>('ANALYZE_STREAM_HUNYUAN_WHEN_PARSED')?.trim() === '1'
      const allHaveParsed = ordered.every((f) => (f.parsedContent ?? '').trim().length > 0)

      if (allHaveParsed && !forceAnalyzeTimeHunyuan) {
        if (ordered.length > 1) {
          fileContent = ordered.map((f, i) => `### 图片 ${i + 1}（${f.originalName}）\n\n${f.parsedContent}`).join('\n\n---\n\n')
        } else {
          fileContent = ordered[0].parsedContent!.trim()
        }
        this.logger.log('analyzeStream: 使用上传解析已入库的正文作为需求输入，analyze 阶段不再二次调用混元；流式报告仍走所选 modelConfigId')
      } else if (ordered.length === 1 && this.hunyuanMultimodalEnvReady()) {
        const f = ordered[0]
        const mime = (f.mimeType || '').toLowerCase()
        const isImgPdf = mime.startsWith('image/') || mime.includes('pdf')
        if (isImgPdf && f.path) {
          try {
            const fk = mime.includes('pdf') ? 'PDF' : 'IMAGE'
            const { text } = await this.multimodal.analyzeFileForRequirements({
              userId,
              storedPath: f.path,
              localPath: f.path,
              fileKind: fk,
              fileBytes: Number(f.size) || 0,
              customPrompt: dto.customPrompt,
              uploadedFileId: f.id,
            })
            if (text?.trim()) fileContent = text.trim()
          } catch (e) {
            this.logger.warn(`analyzeStream: 混元多模态失败，回退解析文本: ${(e as Error).message}`)
          }
        }
      }

      if (!fileContent?.trim()) {
        if (ordered.length > 1) {
          for (const f of ordered) {
            if (!f.parsedContent?.trim()) {
              throw new BadRequestException(`文件尚未解析完成：${f.originalName}`)
            }
          }
          fileContent = ordered.map((f, i) => `### 图片 ${i + 1}（${f.originalName}）\n\n${f.parsedContent}`).join('\n\n---\n\n')
        } else {
          const f = ordered[0]
          if (!f.parsedContent?.trim()) {
            throw new BadRequestException(`文件尚未解析完成：${f.originalName}`)
          }
          fileContent = f.parsedContent ?? undefined
        }
      }
    }

    const primaryFileId = dto.fileId

    // 构建轻量记录
    const record = await this.prisma.generationRecord.create({
      data: {
        title: `需求分析 ${new Date().toLocaleString('zh-CN')}`,
        status: GenerationStatus.PROCESSING,
        sourceType: dto.sourceType,
        prompt: dto.customPrompt || '',
        demandContent: fileContent || dto.text || '',
        generationSource: primaryFileId ? GenerationSource.FILE_PARSE : GenerationSource.MANUAL_INPUT,
        modelId,
        modelName,
        creatorId: userId,
        fileId: primaryFileId,
      },
    })

    // SSE 头
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no')
    res.flushHeaders()

    const keepAliveMs = 15000
    const keepAlive = setInterval(() => {
      if (!res.writableEnded) res.write(': ping\n\n')
    }, keepAliveMs)

    let fullContent = ''
    let finishReason: string | null = null
    try {
      // 构建用户内容
      let userContent = dto.customPrompt || '请对以下需求文档进行详细的结构化分析，输出 Markdown 格式的需求分析报告。'
      if (fileContent) {
        userContent += `\n\n需求文档内容：\n${fileContent}`
      } else if (dto.text) {
        userContent += `\n\n需求描述：\n${dto.text}`
      }

      const maxOut = this.effectiveMaxTokens(dto.maxTokens)
      const systemContent = '你是资深系统架构师与高级产品经理，擅长需求分析与结构化输出。请严格按用户给出的指令与文档内容，使用 Markdown 排版，层次清晰。'
      const stream = await client.chat.completions.create({
        model: modelId,
        messages: [
          {
            role: 'system',
            content: systemContent,
          },
          { role: 'user', content: userContent },
        ],
        temperature: 0.7,
        max_tokens: maxOut,
        stream: true,
      })

      for await (const chunk of stream) {
        const ch0 = chunk.choices[0]
        const fr = ch0?.finish_reason
        if (fr) finishReason = fr
        const d = ch0?.delta as { content?: string; reasoning_content?: string } | undefined
        const delta = (typeof d?.content === 'string' ? d.content : '') || (typeof d?.reasoning_content === 'string' ? d.reasoning_content : '')
        if (delta) {
          fullContent += delta
          res.write(`data: ${JSON.stringify({ content: delta })}\n\n`)
        }
      }

      if (finishReason === 'length') {
        this.logger.warn('analyzeStream: 模型输出因 max_tokens 被截断')
        const continued = await this.continuePlainTextOutput(
          client,
          modelId,
          systemContent,
          userContent,
          fullContent,
          maxOut,
          (delta) => res.write(`data: ${JSON.stringify({ content: delta })}\n\n`),
        )
        fullContent = continued.content
        finishReason = continued.finishReason
        if (continued.attempts > 0) {
          this.writeStreamNotice(res, `模型输出触达最大 Token 后已自动续写 ${continued.attempts} 次。`)
        }
        if (continued.failureReason) {
          this.writeStreamNotice(res, `自动续写中断：${continued.failureReason}`)
        }
        if (finishReason === 'length') this.writeStreamNotice(res, OUTPUT_TRUNCATED_NOTICE)
      }

      // 更新记录
      const duration = Date.now() - startTime
      await this.prisma.generationRecord.update({
        where: { id: record.id },
        data: {
          status: GenerationStatus.SUCCESS,
          demandContent: fullContent.slice(
            0,
            resolveStreamContentMaxChars(this.config.get<string>('ANALYSIS_RECORD_MAX_CHARS')),
          ),
          duration,
          tokensUsed: undefined,
        },
      })

      res.write(`data: ${JSON.stringify({ recordId: record.id, done: true })}\n\n`)
      res.write(`data: [DONE]\n\n`)
      res.end()
    } catch (err: unknown) {
      const message = humanizeAiProviderError(err instanceof Error ? err.message : String(err))
      await this.prisma.generationRecord.update({
        where: { id: record.id },
        data: { status: GenerationStatus.FAILED, errorMessage: message },
      })
      if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify({ error: message })}\n\n`)
        res.end()
      }
    } finally {
      clearInterval(keepAlive)
    }
  }
}
