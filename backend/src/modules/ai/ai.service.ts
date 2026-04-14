import {
  Injectable,
  BadRequestException,
  Logger,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import OpenAI from 'openai'
import { Response } from 'express'
import { PrismaService } from '@/prisma/prisma.service'
import { GenerationStatus } from '@prisma/client'
import { GenerateDto } from './dto/generate.dto'
import { PromptBuilderService } from './prompt-builder.service'

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name)

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private promptBuilder: PromptBuilderService,
  ) {}

  /** 根据配置获取 OpenAI 客户端（兼容多模型） */
  private async getOpenAIClient(modelConfigId?: string): Promise<{ client: OpenAI; modelId: string; modelName: string }> {
    let baseUrl = this.config.get<string>('OPENAI_BASE_URL', 'https://api.openai.com/v1')
    let apiKey = this.config.get<string>('OPENAI_API_KEY', '')
    let modelId = this.config.get<string>('DEFAULT_AI_MODEL', 'gpt-4o')
    let modelName = modelId

    if (modelConfigId) {
      const config = await this.prisma.aIModelConfig.findUnique({ where: { id: modelConfigId } })
      if (config) {
        baseUrl = config.baseUrl
        apiKey = config.apiKey
        modelId = config.modelId
        modelName = config.name
      }
    } else {
      // 使用默认模型
      const defaultModel = await this.prisma.aIModelConfig.findFirst({ where: { isDefault: true, isActive: true } })
      if (defaultModel) {
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
    return { client, modelId, modelName }
  }

  /** 获取可用模型列表 */
  async getModels() {
    const models = await this.prisma.aIModelConfig.findMany({
      where: { isActive: true },
      select: { id: true, name: true, provider: true, modelId: true, baseUrl: true, isDefault: true, maxTokens: true, temperature: true },
    })
    return models
  }

  private async resolveRequirement(dto: GenerateDto): Promise<{ requirement: string; fileId?: string }> {
    if (dto.sourceType === 'file') {
      if (!dto.fileId) throw new BadRequestException('缺少 fileId')
      const file = await this.prisma.uploadedFile.findUnique({ where: { id: dto.fileId } })
      if (!file?.parsedContent) throw new BadRequestException('文件内容尚未解析完成，请稍后重试')
      return { requirement: file.parsedContent, fileId: dto.fileId }
    }
    if (dto.sourceType === 'text') {
      if (!dto.text?.trim()) throw new BadRequestException('请输入需求文本')
      return { requirement: dto.text.trim() }
    }
    if (dto.sourceType === 'url') {
      if (!dto.url?.trim()) throw new BadRequestException('请输入 URL')
      return { requirement: dto.url.trim() }
    }
    throw new BadRequestException('不支持的 sourceType')
  }

  /** 非流式生成 */
  async generate(dto: GenerateDto, userId: string) {
    const { client, modelId, modelName } = await this.getOpenAIClient(dto.modelConfigId)
    const startTime = Date.now()

    const { requirement, fileId } = await this.resolveRequirement(dto)
    const built = await this.promptBuilder.build(dto, requirement)

    // 创建生成记录
    const record = await this.prisma.generationRecord.create({
      data: {
        title: `生成记录 ${new Date().toLocaleString('zh-CN')}`,
        status: GenerationStatus.PROCESSING,
        sourceType: dto.sourceType,
        prompt: JSON.stringify({
          system: built.system,
          user: built.user,
          templateId: built.resolvedTemplateId ?? dto.templateId ?? null,
          generationOptions: dto.generationOptions ?? null,
          aiParams: { modelConfigId: dto.modelConfigId ?? null, temperature: dto.temperature, maxTokens: dto.maxTokens },
        }),
        modelId,
        modelName,
        creatorId: userId,
        fileId,
        templateId: built.resolvedTemplateId ?? dto.templateId,
      },
    })

    try {
      const completion = await client.chat.completions.create({
        model: modelId,
        messages: [
          { role: 'system', content: built.system },
          { role: 'user', content: built.user },
        ],
        temperature: dto.temperature ?? 0.7,
        max_tokens: dto.maxTokens ?? 4096,
        response_format: { type: 'json_object' },
      })

      const content = completion.choices[0]?.message?.content || '{}'
      const parsed = JSON.parse(content)
      const cases = parsed.cases || []
      const quality = parsed.quality || null

      // 创建用例集和用例
      const suite = await this.prisma.testSuite.create({
        data: {
          name: `AI 生成用例集 - ${new Date().toLocaleString('zh-CN')}`,
          creatorId: userId,
          cases: {
            create: cases.map((c: any) => ({
              title: c.title || c.name || '未命名用例',
              precondition: c.precondition || '',
              steps: (Array.isArray(c.steps) ? c.steps : []).map((s: any, idx: number) => ({
                order: idx + 1,
                action: typeof s === 'string' ? s : (s?.action || ''),
                expected: typeof s === 'string' ? '' : (s?.expected || ''),
              })),
              expectedResult: c.expected || c.expectedResult || '',
              priority: (c.priority || 'P2') as any,
              type: (dto.generationOptions?.testType || c.type || 'FUNCTIONAL') as any,
              tags: Array.isArray(c.tags) ? c.tags : [],
            })),
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

      return {
        recordId: record.id,
        cases: suite.cases,
        tokensUsed: completion.usage?.total_tokens,
        duration,
        qualityScore: typeof quality?.score === 'number' ? quality.score : null,
        qualitySuggestions: Array.isArray(quality?.suggestions) ? quality.suggestions.join('\n') : null,
      }
    } catch (err) {
      await this.prisma.generationRecord.update({
        where: { id: record.id },
        data: { status: GenerationStatus.FAILED, errorMessage: err instanceof Error ? err.message : String(err) },
      })
      throw err
    }
  }

  /** 流式生成（SSE） */
  async generateStream(dto: GenerateDto, userId: string, res: Response) {
    const { client, modelId, modelName } = await this.getOpenAIClient(dto.modelConfigId)
    const startTime = Date.now()

    const { requirement, fileId } = await this.resolveRequirement(dto)
    const built = await this.promptBuilder.build(dto, requirement)

    const record = await this.prisma.generationRecord.create({
      data: {
        title: `流式生成记录 ${new Date().toLocaleString('zh-CN')}`,
        status: GenerationStatus.PROCESSING,
        sourceType: dto.sourceType,
        prompt: JSON.stringify({
          system: built.system,
          user: built.user,
          templateId: built.resolvedTemplateId ?? dto.templateId ?? null,
          generationOptions: dto.generationOptions ?? null,
          aiParams: { modelConfigId: dto.modelConfigId ?? null, temperature: dto.temperature, maxTokens: dto.maxTokens },
        }),
        modelId,
        modelName,
        creatorId: userId,
        fileId,
        templateId: built.resolvedTemplateId ?? dto.templateId,
      },
    })

    // 设置 SSE 响应头
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.flushHeaders()

    let fullContent = ''
    try {
      const stream = await client.chat.completions.create({
        model: modelId,
        messages: [
          { role: 'system', content: built.system },
          { role: 'user', content: built.user },
        ],
        temperature: dto.temperature ?? 0.7,
        max_tokens: dto.maxTokens ?? 4096,
        stream: true,
      })

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content || ''
        if (delta) {
          fullContent += delta
          // 仅输出纯文本片段；前端实时拼接展示
          res.write(`data: ${JSON.stringify({ t: delta })}\n\n`)
        }
      }

      // 解析最终内容，保存用例
      let cases: any[] = []
      let quality: any = null
      try {
        const parsed = JSON.parse(fullContent)
        cases = parsed.cases || []
        quality = parsed.quality || null
      } catch {
        this.logger.warn('流式响应内容解析 JSON 失败')
      }

      const suite = await this.prisma.testSuite.create({
        data: {
          name: `AI 流式生成用例集 - ${new Date().toLocaleString('zh-CN')}`,
          creatorId: userId,
          cases: { create: cases.map((c: any) => ({ title: c.title, steps: c.steps || [], expectedResult: c.expectedResult || '', priority: c.priority || 'P2', type: c.type || 'FUNCTIONAL', tags: c.tags || [] })) },
        },
        include: { cases: true },
      })

      await this.prisma.generationRecord.update({
        where: { id: record.id },
        data: { status: GenerationStatus.SUCCESS, caseCount: suite.cases.length, suiteId: suite.id, duration: Date.now() - startTime },
      })

      res.write(`data: ${JSON.stringify({ done: true, recordId: record.id, quality })}\n\n`)
      res.write(`data: [DONE]\n\n`)
      res.end()
    } catch (err) {
      await this.prisma.generationRecord.update({
        where: { id: record.id },
        data: { status: GenerationStatus.FAILED, errorMessage: err instanceof Error ? err.message : String(err) },
      })
      res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`)
      res.end()
    }
  }
}
