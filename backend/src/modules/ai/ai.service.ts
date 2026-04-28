import {
  Injectable,
  BadRequestException,
  Logger,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import OpenAI from 'openai'
import { Response } from 'express'
import { PrismaService } from '@/prisma/prisma.service'
import { GenerationSource, GenerationStatus, Prisma } from '@prisma/client'
import { GenerateDto } from './dto/generate.dto'
import { parseLooseMarkdownToCaseRows } from './parse-loose-ai-output.util'
import {
  clampGenerationUserContent,
  humanizeAiProviderError,
  INPUT_CLAMPED_NOTICE_PREFIX,
  OUTPUT_TRUNCATED_NOTICE,
  roughTokenEstimateFromChars,
} from './ai-generation-limits.util'

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name)

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

    return []
  }

  /** 无法解析为 JSON 用例时落库一条「原文」用例，避免成功状态却 0 条记录 */
  private fallbackCasesFromRawOutput(raw: string): any[] {
    const t = (raw || '').trim()
    if (!t) return []
    const body =
      t.length > 200_000
        ? `${t.slice(0, 200_000)}\n\n…(内容过长已截断，完整文本请从生成流式输出中复制)`
        : t
    return [
      {
        title: 'AI 生成结果（非 JSON，可人工拆分或换用要求 JSON 输出的模板）',
        precondition: '',
        steps: [{ order: 1, action: '查看下方预期结果中的完整模型输出', expected: '' }],
        expectedResult: body,
        priority: 'P2',
        type: 'FUNCTIONAL',
        tags: ['ai-raw-output'],
      },
    ]
  }

  /** 模型无可用文本 / 无法解析为 JSON 用例时，统一错误说明（不再落库「占位假用例」） */
  private emptyOutputUserMessage(opts?: { outputTruncated?: boolean }): string {
    const base =
      '模型未返回可解析的 JSON 用例（输出为空或结构不符合约定）。请检查：系统设置中的模型 ID、API Key、Base URL；需求/文本是否为空；图片是否已解析出文字；适当提高 maxTokens；智谱等兼容接口流式是否仅返回在 delta 的其他字段。可在生成记录中查看详情。'
    if (opts?.outputTruncated) {
      return `${base} 另外：本次回复可能因达到「最大 Token」被截断，请先调高 Token 上限或缩小生成范围后重试。`
    }
    return base
  }

  private effectiveMaxTokens(requested?: number): number {
    const r = requested ?? 4096
    return Math.min(Math.max(Math.floor(r), 256), 128_000)
  }

  private writeStreamNotice(res: Response, text: string) {
    if (res.writableEnded) return
    res.write(`data: ${JSON.stringify({ notice: text })}\n\n`)
  }

  private mapRowToCaseInput(c: any) {
    const title =
      c?.title != null && String(c.title).trim()
        ? String(c.title).slice(0, 500)
        : '未命名用例'
    const steps = Array.isArray(c?.steps) ? c.steps : []
    const expectedResult =
      c?.expectedResult != null && String(c.expectedResult).trim()
        ? String(c.expectedResult)
        : '（无）'
    const tags = Array.isArray(c?.tags) ? [...c.tags.map((x: unknown) => String(x))] : []
    const mod =
      c?.module != null && String(c.module).trim()
        ? String(c.module).trim()
        : c?.所属模块 != null && String(c.所属模块).trim()
          ? String(c.所属模块).trim()
          : ''
    if (mod && !tags.some((t) => t === `模块:${mod}` || t.startsWith('模块:'))) {
      tags.push(`模块:${mod}`)
    }
    return {
      title,
      precondition: c?.precondition != null ? String(c.precondition) : undefined,
      description: c?.description != null ? String(c.description) : undefined,
      steps,
      expectedResult,
      priority: c?.priority || 'P2',
      type: c?.type || 'FUNCTIONAL',
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
  ) {}

  /** 落库时的团队、来源枚举、参数快照与模板全文 */
  private async buildRecordPersistExtras(dto: GenerateDto, userId: string) {
    const [u, tpl] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId }, select: { teamId: true } }),
      dto.templateId
        ? this.prisma.promptTemplate.findUnique({
            where: { id: dto.templateId },
            select: { content: true },
          })
        : Promise.resolve(null),
    ])
    const generationSource = dto.templateId
      ? GenerationSource.TEMPLATE
      : dto.fileId
        ? GenerationSource.FILE_PARSE
        : GenerationSource.MANUAL_INPUT
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
    }
  }

  /** 根据配置获取 OpenAI 客户端（兼容多模型）。configId 为库中记录 id，纯环境变量回退时为 null。 */
  private async getOpenAIClient(
    modelConfigId?: string,
  ): Promise<{ client: OpenAI; modelId: string; modelName: string; configId: string | null }> {
    let baseUrl = this.config.get<string>('OPENAI_BASE_URL', 'https://api.openai.com/v1')
    let apiKey = this.config.get<string>('OPENAI_API_KEY', '')
    let modelId = this.config.get<string>('DEFAULT_AI_MODEL', 'gpt-4o')
    let modelName = modelId
    let configId: string | null = null

    if (modelConfigId) {
      const config = await this.prisma.aIModelConfig.findUnique({ where: { id: modelConfigId } })
      if (config) {
        configId = config.id
        baseUrl = config.baseUrl
        apiKey = config.apiKey
        modelId = config.modelId
        modelName = config.name
      }
    } else {
      // 使用默认模型
      const defaultModel = await this.prisma.aIModelConfig.findFirst({ where: { isDefault: true, isActive: true } })
      if (defaultModel) {
        configId = defaultModel.id
        baseUrl = defaultModel.baseUrl
        apiKey = defaultModel.apiKey
        modelId = defaultModel.modelId
        modelName = defaultModel.name
      }
    }

    if (!apiKey || apiKey === 'placeholder') {
      throw new BadRequestException('AI API Key 未配置，请在系统设置中配置模型')
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

  /** 管理用途：测试指定模型连通性（小请求，返回延迟与回包片段）；成功/失败均写入 DB 观测字段（若有对应配置行） */
  async testModelConnectivity(opts?: { modelConfigId?: string; prompt?: string }) {
    const { client, modelId, modelName, configId } = await this.getOpenAIClient(opts?.modelConfigId)
    const prompt =
      (opts?.prompt || '').trim() ||
      '请回复一个单词：ok'

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
      const message =
        err instanceof Error ? err.message : typeof err === 'string' ? err : JSON.stringify(err)
      await persistFailure(message)
      throw err
    }
  }

  /** 构建 system / user 消息；过长用户内容自动首尾压缩，避免超出上下文 */
  private buildPromptMessages(dto: GenerateDto, fileContent?: string): {
    system: string
    user: string
    inputNotices: string[]
  } {
    const systemPrompt = `你是一名专业的软件测试工程师，精通各类测试方法和测试用例编写规范。

【输出硬性要求】
1. 只输出一个合法 JSON 对象，不要 Markdown 标题、不要代码围栏、不要在 JSON 前后写任何解释；第一个非空白字符必须是 {。
2. 必须包含顶层键 "cases"，且为数组；每条业务用例对应 cases 里的一个对象，禁止把多条用例合并进同一条的 expectedResult 长文。
3. 每条用例字段：title（用例名称）、priority、type、precondition（前置条件）、steps（数组）、expectedResult（最终预期）、tags（标签数组，可含模块名）。
4. 若需表示「所属模块」，请写入 tags，例如 "tags": ["登录模块"] 或使用 "模块:登录" 形式。
5. 禁止用 Markdown（###、**用例** 等）代替 JSON。
6. 若用户材料过长，请优先覆盖核心流程与高优先级（P0/P1）用例，避免单条字段内堆砌过多文字。

约定结构示例：
{
  "cases": [
    {
      "title": "用例标题",
      "priority": "P0|P1|P2|P3",
      "type": "FUNCTIONAL|PERFORMANCE|SECURITY|COMPATIBILITY|REGRESSION",
      "precondition": "前置条件（可为空）",
      "steps": [{"order": 1, "action": "操作步骤", "expected": "中间预期（可为空）"}],
      "expectedResult": "最终预期结果",
      "tags": ["标签1", "标签2"]
    }
  ]
}`

    let userContent = dto.customPrompt || '请生成全面的测试用例，覆盖正向、逆向和边界场景。'

    if (fileContent) {
      userContent += `\n\n需求/文档内容：\n${fileContent}`
    } else if (dto.text) {
      userContent += `\n\n需求描述：\n${dto.text}`
    }

    const { text, truncated, omittedChars, originalLength } = clampGenerationUserContent(userContent)
    const inputNotices: string[] = []
    if (truncated) {
      this.logger.warn(
        `生成输入已压缩: 原 ${originalLength} 字符 (≈${roughTokenEstimateFromChars(originalLength)} tokens 粗估), 省略中间 ${omittedChars} 字`,
      )
      inputNotices.push(
        `${INPUT_CLAMPED_NOTICE_PREFIX}原约 ${originalLength} 字，已省略中间 ${omittedChars} 字（保留首尾）。建议拆分需求、摘要后再生成。`,
      )
    }

    return { system: systemPrompt, user: text, inputNotices }
  }

  /** 非流式生成 */
  async generate(dto: GenerateDto, userId: string) {
    const { client, modelId, modelName } = await this.getOpenAIClient(dto.modelConfigId)
    const startTime = Date.now()

    // 获取文件内容
    let fileContent: string | undefined
    if (dto.fileId) {
      const file = await this.prisma.uploadedFile.findUnique({ where: { id: dto.fileId } })
      if (!file?.parsedContent) throw new BadRequestException('文件内容尚未解析完成，请稍后重试')
      fileContent = file.parsedContent
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
        teamId: extras.teamId ?? undefined,
        modelId,
        modelName,
        creatorId: userId,
        fileId: dto.fileId,
        templateId: dto.templateId,
      },
    })

    try {
      const { system, user, inputNotices } = this.buildPromptMessages(dto, fileContent)
      const maxOut = this.effectiveMaxTokens(dto.maxTokens)
      const completion = await client.chat.completions.create({
        model: modelId,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        temperature: dto.temperature ?? 0.7,
        max_tokens: maxOut,
        response_format: { type: 'json_object' },
      })

      const choice = completion.choices[0]
      const content = choice?.message?.content || ''
      const finishReason = choice?.finish_reason ?? null
      const outputWarnings: string[] = []
      if (finishReason === 'length') {
        outputWarnings.push(OUTPUT_TRUNCATED_NOTICE)
        this.logger.warn('非流式生成：模型输出因 max_tokens 被截断')
      }

      const rows = this.resolveCasesForPersistence(content)
      if (rows.length === 0) {
        const msg = this.emptyOutputUserMessage({ outputTruncated: finishReason === 'length' })
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

      await this.bumpTemplateUsage(dto.templateId)

      const warnings = [...inputNotices, ...outputWarnings].filter(Boolean)
      return {
        recordId: record.id,
        cases: suite.cases,
        tokensUsed: completion.usage?.total_tokens,
        duration,
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
    const { client, modelId, modelName } = await this.getOpenAIClient(dto.modelConfigId)
    const startTime = Date.now()

    let fileContent: string | undefined
    if (dto.fileId) {
      const file = await this.prisma.uploadedFile.findUnique({ where: { id: dto.fileId } })
      if (!file?.parsedContent) throw new BadRequestException('文件内容尚未解析完成')
      fileContent = file.parsedContent
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
    let finishReason: string | null = null
    try {
      const { system, user, inputNotices } = this.buildPromptMessages(dto, fileContent)
      for (const n of inputNotices) {
        this.writeStreamNotice(res, n)
      }

      const maxOut = this.effectiveMaxTokens(dto.maxTokens)
      const stream = await client.chat.completions.create({
        model: modelId,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        temperature: dto.temperature ?? 0.7,
        max_tokens: maxOut,
        stream: true,
      })

      for await (const chunk of stream) {
        const ch0 = chunk.choices[0]
        const fr = ch0?.finish_reason
        if (fr) finishReason = fr
        const d = ch0?.delta as { content?: string; reasoning_content?: string } | undefined
        const delta =
          (typeof d?.content === 'string' ? d.content : '') ||
          (typeof d?.reasoning_content === 'string' ? d.reasoning_content : '')
        if (delta) {
          fullContent += delta
          res.write(`data: ${JSON.stringify({ content: delta })}\n\n`)
        }
      }

      if (finishReason === 'length') {
        this.writeStreamNotice(res, OUTPUT_TRUNCATED_NOTICE)
        this.logger.warn('流式生成：模型输出因 max_tokens 被截断')
      }

      const rows = this.resolveCasesForPersistence(fullContent)
      if (rows.length === 0) {
        const msg = this.emptyOutputUserMessage({ outputTruncated: finishReason === 'length' })
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
        data: { status: GenerationStatus.SUCCESS, caseCount: suite.cases.length, suiteId: suite.id, duration: Date.now() - startTime },
      })

      await this.bumpTemplateUsage(dto.templateId)

      res.write(
        `data: ${JSON.stringify({
          recordId: record.id,
          suiteId: suite.id,
          caseCount: suite.cases.length,
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
}
