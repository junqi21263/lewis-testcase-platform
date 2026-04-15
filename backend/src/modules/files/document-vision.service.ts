import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import OpenAI from 'openai'
import * as fs from 'fs'
import type { AIModelConfig } from '@prisma/client'
import { PrismaService } from '@/prisma/prisma.service'

/** 多模态图文理解：与文档结构化链路衔接，输出严格 JSON，再由本服务转为正文供脱敏与二次结构化 */
const VISION_STRUCTURE_SYSTEM = `# 角色
你是专业的软件测试需求分析师，精通多模态图文理解，能精准从图片、扫描件、文档截图、原型图、流程图中，提取并提炼出可用于测试用例编写的有效业务需求，过滤所有无效冗余信息。

# 核心任务
基于用户上传的图片/扫描件/PDF 页面等内容，完成以下 3 个核心动作，严格按照输出格式返回结果：
1. 深度理解图片中的所有内容，区分有效业务需求与无效冗余信息，过滤所有非需求类内容
2. 提炼出完整、无歧义、可测试的业务需求点，拆分为独立的结构化条目
3. 保留完整的原始有效文本，用于用户回溯核对

# 过滤规则（必须严格执行）
必须过滤的内容包括但不限于：
- OCR 识别乱码、无意义字符、重复字符、水印、页码、页眉页脚
- 图片中的无关标识、技术标签、工具名称、日志信息（如【OCR | Tesseract】、版本号、服务器信息）
- 个人隐私信息：手机号、身份证号、姓名、地址、银行卡号等，仅保留脱敏后的相关业务描述
- 与业务需求无关的装饰性内容、UI 元素标注、非需求类的备注信息
- 空白内容、无意义的符号、标点

# 提取规则
1. 每条需求点必须是一句完整、通顺、无歧义的业务描述，可直接用于测试用例编写
2. 需求点按业务逻辑排序，相同模块的需求合并为同一条，避免拆分过细
3. 保留需求中的业务规则、前置条件、权限要求、操作流程、预期效果等核心信息
4. 若图片为流程图/原型图，需先理解完整业务流程，再转化为对应的业务需求描述，而非单纯的元素罗列
5. 若图片中无有效业务需求，须设 is_valid 为 false，demand_list 可为空数组，original_text 可为空，msg 中写明原因；并在 msg 或 original_text 中体现说明：未识别到有效业务需求，请检查上传内容或手动输入需求

# 输出格式（必须严格遵循 JSON，键名使用英文；禁止输出 JSON 以外的任何字符、不要 Markdown 代码块）
{
  "is_valid": true,
  "demand_list": [
    "这里是第一条结构化需求点",
    "这里是第二条结构化需求点",
    "以此类推"
  ],
  "original_text": "这里是过滤无效内容后的完整原始有效文本，保留原文的段落与格式，与 demand_list 内容一一对应",
  "msg": "解析成功/解析失败的提示信息"
}`

const VISION_NO_RESULT_HINT =
  '未识别到有效业务需求，请检查上传内容或手动输入需求'

@Injectable()
export class DocumentVisionService {
  private readonly logger = new Logger(DocumentVisionService.name)

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  /**
   * 解析顺序：环境变量 VISION_PARSE_MODEL_CONFIG_ID → 标记为「文档视觉解析」的模型
   * → 支持视觉且为默认的模型；均无则返回 null（走 OCR / 纯文本 PDF）。
   */
  async resolveVisionModel(): Promise<AIModelConfig | null> {
    const envId = this.config.get<string>('VISION_PARSE_MODEL_CONFIG_ID')?.trim()
    if (envId) {
      const m = await this.prisma.aIModelConfig.findFirst({
        where: { id: envId, isActive: true },
      })
      if (m?.apiKey && m.apiKey !== 'placeholder') return m
      this.logger.warn(`VISION_PARSE_MODEL_CONFIG_ID=${envId} 未找到、已停用或未配置 Key`)
    }

    const designated = await this.prisma.aIModelConfig.findFirst({
      where: { useForDocumentVisionParse: true, isActive: true },
    })
    if (designated?.apiKey && designated.apiKey !== 'placeholder') return designated

    const fallback = await this.prisma.aIModelConfig.findFirst({
      where: { supportsVision: true, isDefault: true, isActive: true },
    })
    if (fallback?.apiKey && fallback.apiKey !== 'placeholder') return fallback

    return null
  }

  private openaiFor(cfg: AIModelConfig) {
    return new OpenAI({
      apiKey: cfg.apiKey,
      baseURL: cfg.baseUrl.replace(/\/+$/, ''),
    })
  }

  /**
   * 将视觉模型返回的 JSON（或历史纯文本）转为单一正文，供 mask + RequirementStructure 使用。
   */
  private visionResponseToDocumentText(raw: string): string {
    const trimmed = raw.trim()
    if (!trimmed) return VISION_NO_RESULT_HINT

    try {
      const p = JSON.parse(trimmed) as {
        is_valid?: boolean
        demand_list?: unknown
        original_text?: unknown
        msg?: unknown
      }
      const orig = typeof p.original_text === 'string' ? p.original_text.trim() : ''
      const list = Array.isArray(p.demand_list)
        ? p.demand_list
            .map((x) => (typeof x === 'string' ? x.trim() : String(x)))
            .filter((s) => s.length > 0)
        : []
      const msg = typeof p.msg === 'string' ? p.msg.trim() : ''

      if (orig.length > 0) return orig
      if (list.length > 0) return list.join('\n\n')
      if (msg.length > 0) return msg
      if (p.is_valid === false) return VISION_NO_RESULT_HINT
      return VISION_NO_RESULT_HINT
    } catch {
      return trimmed
    }
  }

  async transcribeImageBuffer(cfg: AIModelConfig, buffer: Buffer, mimeType: string): Promise<string> {
    const base64 = buffer.toString('base64')
    const dataUrl = `data:${mimeType};base64,${base64}`
    const client = this.openaiFor(cfg)
    const maxTokens = Math.min(cfg.maxTokens || 4096, 8192)
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: VISION_STRUCTURE_SYSTEM },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: '请根据附图完成分析，并仅输出约定的一个 JSON 对象（不要其它说明文字）。',
          },
          { type: 'image_url', image_url: { url: dataUrl, detail: 'high' } },
        ],
      },
    ]
    const temperature = Math.min(cfg.temperature ?? 0.3, 0.7)

    try {
      const completion = await client.chat.completions.create({
        model: cfg.modelId,
        messages,
        max_tokens: maxTokens,
        temperature,
        response_format: { type: 'json_object' },
      })
      const raw = (completion.choices[0]?.message?.content || '').trim()
      return this.visionResponseToDocumentText(raw)
    } catch (e) {
      this.logger.warn(
        `视觉解析 json_object 不可用或失败，回退为普通输出: ${(e as Error).message}`,
      )
      const completion = await client.chat.completions.create({
        model: cfg.modelId,
        messages,
        max_tokens: maxTokens,
        temperature,
      })
      const raw = (completion.choices[0]?.message?.content || '').trim()
      return this.visionResponseToDocumentText(raw)
    }
  }

  /** 图片：视觉 + OCR 由调用方组合 */
  async transcribeImageFileAuto(imagePath: string, mimeType: string): Promise<{ text: string; modelName: string } | null> {
    const cfg = await this.resolveVisionModel()
    if (!cfg) return null
    try {
      const buf = fs.readFileSync(imagePath)
      if (buf.length > 18 * 1024 * 1024) {
        this.logger.warn('图片过大，视觉解析可能失败，请压缩后重试')
      }
      const text = await this.transcribeImageBuffer(cfg, buf, mimeType || 'image/jpeg')
      if (!text) return null
      return { text, modelName: cfg.name }
    } catch (e) {
      this.logger.warn(`视觉解析图片失败: ${(e as Error).message}`)
      return null
    }
  }

  async renderPdfFirstPagePng(pdfPath: string): Promise<Buffer | null> {
    try {
      const { pdf } = await import('pdf-to-img')
      const document = await pdf(pdfPath, { scale: 1.5 })
      for await (const image of document) {
        return Buffer.from(image)
      }
    } catch (e) {
      this.logger.warn(
        `PDF 转图失败（部署环境需允许安装/构建 canvas，见 README）: ${(e as Error).message}`,
      )
    }
    return null
  }

  async transcribePdfFirstPageVision(pdfPath: string): Promise<{ text: string; modelName: string } | null> {
    const png = await this.renderPdfFirstPagePng(pdfPath)
    if (!png) return null
    const cfg = await this.resolveVisionModel()
    if (!cfg) return null
    try {
      const text = await this.transcribeImageBuffer(cfg, png, 'image/png')
      if (!text) return null
      return { text, modelName: cfg.name }
    } catch (e) {
      this.logger.warn(`PDF 首页视觉解析失败: ${(e as Error).message}`)
      return null
    }
  }
}
