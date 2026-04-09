import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import OpenAI from 'openai'
import { Response } from 'express'
import { PrismaService } from '@/prisma/prisma.service'
import { GenerationStatus } from '@prisma/client'
import { GenerateDto } from './dto/generate.dto'

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name)

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
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

  /** 构建提示词 */
  private buildPrompt(dto: GenerateDto, fileContent?: string): string {
    const systemPrompt = `你是一名专业的软件测试工程师，精通各类测试方法和测试用例编写规范。
请严格按照 JSON 格式输出测试用例，格式如下：
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

    return JSON.stringify({ system: systemPrompt, user: userContent })
  }

  /** 非流式生成 */
  async generate(dto: GenerateDto, userId: string) {
    const { client, modelId, modelName } = await this.getOpenAIClient()
    const startTime = Date.now()

    // 获取文件内容
    let fileContent: string | undefined
    if (dto.fileId) {
      const file = await this.prisma.uploadedFile.findUnique({ where: { id: dto.fileId } })
      if (!file?.parsedContent) throw new BadRequestException('文件内容尚未解析完成，请稍后重试')
      fileContent = file.parsedContent
    }

    // 创建生成记录
    const record = await this.prisma.generationRecord.create({
      data: {
        title: `生成记录 ${new Date().toLocaleString('zh-CN')}`,
        status: GenerationStatus.PROCESSING,
        sourceType: dto.sourceType,
        prompt: dto.customPrompt || '',
        modelId,
        modelName,
        creatorId: userId,
        fileId: dto.fileId,
        templateId: dto.templateId,
      },
    })

    try {
      const messages = JSON.parse(this.buildPrompt(dto, fileContent))
      const completion = await client.chat.completions.create({
        model: modelId,
        messages: [
          { role: 'system', content: messages.system },
          { role: 'user', content: messages.user },
        ],
        temperature: dto.temperature ?? 0.7,
        max_tokens: dto.maxTokens ?? 4096,
        response_format: { type: 'json_object' },
      })

      const content = completion.choices[0]?.message?.content || '{}'
      const parsed = JSON.parse(content)
      const cases = parsed.cases || []

      // 创建用例集和用例
      const suite = await this.prisma.testSuite.create({
        data: {
          name: `AI 生成用例集 - ${new Date().toLocaleString('zh-CN')}`,
          creatorId: userId,
          cases: {
            create: cases.map((c: any) => ({
              title: c.title,
              precondition: c.precondition,
              steps: c.steps || [],
              expectedResult: c.expectedResult,
              priority: c.priority || 'P2',
              type: c.type || 'FUNCTIONAL',
              tags: c.tags || [],
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

      return { recordId: record.id, cases: suite.cases, tokensUsed: completion.usage?.total_tokens, duration }
    } catch (err) {
      await this.prisma.generationRecord.update({
        where: { id: record.id },
        data: { status: GenerationStatus.FAILED, errorMessage: err.message },
      })
      throw err
    }
  }

  /** 流式生成（SSE） */
  async generateStream(dto: GenerateDto, userId: string, res: Response) {
    const { client, modelId, modelName } = await this.getOpenAIClient()
    const startTime = Date.now()

    let fileContent: string | undefined
    if (dto.fileId) {
      const file = await this.prisma.uploadedFile.findUnique({ where: { id: dto.fileId } })
      if (!file?.parsedContent) throw new BadRequestException('文件内容尚未解析完成')
      fileContent = file.parsedContent
    }

    const record = await this.prisma.generationRecord.create({
      data: {
        title: `流式生成记录 ${new Date().toLocaleString('zh-CN')}`,
        status: GenerationStatus.PROCESSING,
        sourceType: dto.sourceType,
        prompt: dto.customPrompt || '',
        modelId,
        modelName,
        creatorId: userId,
        fileId: dto.fileId,
      },
    })

    // 设置 SSE 响应头
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.flushHeaders()

    let fullContent = ''
    try {
      const messages = JSON.parse(this.buildPrompt(dto, fileContent))
      const stream = await client.chat.completions.create({
        model: modelId,
        messages: [
          { role: 'system', content: messages.system },
          { role: 'user', content: messages.user },
        ],
        temperature: dto.temperature ?? 0.7,
        max_tokens: dto.maxTokens ?? 4096,
        stream: true,
      })

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content || ''
        if (delta) {
          fullContent += delta
          res.write(`data: ${JSON.stringify({ content: delta })}\n\n`)
        }
      }

      // 解析最终内容，保存用例
      let cases: any[] = []
      try {
        const parsed = JSON.parse(fullContent)
        cases = parsed.cases || []
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

      res.write(`data: [DONE]\n\n`)
      res.end()
    } catch (err) {
      await this.prisma.generationRecord.update({
        where: { id: record.id },
        data: { status: GenerationStatus.FAILED, errorMessage: err.message },
      })
      res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`)
      res.end()
    }
  }
}
