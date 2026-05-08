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

/** PDF 首页走视觉链路时的结果（供上层区分转图失败与接口失败） */
export type PdfFirstPageVisionOutcome =
  | { outcome: 'success'; text: string; modelName: string }
  | { outcome: 'pdf_render'; error: string }
  | { outcome: 'vision_api'; error: string }

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
      if (m?.apiKey && m.apiKey !== 'placeholder') {
        if (m.supportsVision) return m
        this.logger.warn(
          `VISION_PARSE_MODEL_CONFIG_ID=${envId} 对应模型未勾选「支持视觉」，已忽略（避免出现 404 / No endpoints ... image input）。请在数据库中勾选 supportsVision 或改用支持图片输入的模型。`,
        )
      } else {
        this.logger.warn(`VISION_PARSE_MODEL_CONFIG_ID=${envId} 未找到、已停用或未配置 Key`)
      }
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
    const timeoutRaw = this.config.get<string>('VISION_API_TIMEOUT_MS')
    const timeoutMs = parseInt(timeoutRaw || '120000', 10)
    const timeout = Number.isFinite(timeoutMs) && timeoutMs >= 10000 ? timeoutMs : 120000
    return new OpenAI({
      apiKey: cfg.apiKey,
      baseURL: cfg.baseUrl.replace(/\/+$/, ''),
      timeout,
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

  /**
   * 同一请求内多张 PNG（例如 PDF 连续页）；detail 使用 low 以降低体积与超时风险。
   */
  async transcribeMultiplePngBuffers(cfg: AIModelConfig, buffers: Buffer[]): Promise<string> {
    if (buffers.length === 0) return ''
    if (buffers.length === 1) return this.transcribeImageBuffer(cfg, buffers[0], 'image/png')

    const client = this.openaiFor(cfg)
    const maxTokens = Math.min(Math.max(cfg.maxTokens || 8192, 4096), 16384)
    const parts: OpenAI.Chat.ChatCompletionContentPart[] = [
      {
        type: 'text',
        text: `以下为同一 PDF 的 ${buffers.length} 页截图（按顺序）。请合并理解业务需求，并仅输出约定的一个 JSON 对象（不要其它说明文字）。`,
      },
      ...buffers.map((buf) => {
        const dataUrl = `data:image/png;base64,${buf.toString('base64')}`
        return {
          type: 'image_url' as const,
          image_url: { url: dataUrl, detail: 'low' as const },
        }
      }),
    ]
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: VISION_STRUCTURE_SYSTEM },
      { role: 'user', content: parts },
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
        `视觉解析（多图 json_object）不可用或失败，回退为普通输出: ${(e as Error).message}`,
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

  /**
   * pdf-to-img 为纯 ESM 且依赖链含 top-level await。
   * 项目在 tsconfig 使用 module=commonjs 时，TypeScript 会把 `import()` 编成 `require()`，运行时报：
   * "require() cannot be used on an ESM graph with top-level await"。
   * 通过间接 import 避免被 downlevel。
   */
  private importPdfToImg(): Promise<typeof import('pdf-to-img')> {
    const runImport = new Function('specifier', 'return import(specifier)') as (
      specifier: string,
    ) => Promise<typeof import('pdf-to-img')>
    return runImport('pdf-to-img')
  }

  /** 按页迭代渲染整本 PDF（pdf-to-img）；用于分页 OCR / 分批视觉理解 */
  async *iteratePdfPagesAsPng(
    pdfPath: string,
  ): AsyncGenerator<{ pageNum: number; buffer: Buffer }, void, unknown> {
    const scaleRaw = this.config.get<string>('VISION_PDF_RENDER_SCALE')
    const scale = Math.min(Math.max(parseFloat(scaleRaw || '1.2') || 1.2, 0.5), 3)
    const { pdf } = await this.importPdfToImg()
    const document = await pdf(pdfPath, { scale })
    let pageNum = 0
    for await (const image of document) {
      pageNum++
      yield { pageNum, buffer: Buffer.from(image) }
    }
  }

  /** 将 PDF 首页渲成 PNG；失败时返回 error 文案（会进入 parseError 便于排障） */
  async renderPdfFirstPagePng(pdfPath: string): Promise<{ buffer: Buffer } | { error: string }> {
    const scaleRaw = this.config.get<string>('VISION_PDF_RENDER_SCALE')
    const scale = Math.min(Math.max(parseFloat(scaleRaw || '1.2') || 1.2, 0.5), 3)
    try {
      const { pdf } = await this.importPdfToImg()
      const document = await pdf(pdfPath, { scale })
      for await (const image of document) {
        return { buffer: Buffer.from(image) }
      }
      return { error: 'PDF 无页面或渲染未产出图像' }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      this.logger.warn(`PDF 转图失败（canvas/pdfjs，scale=${scale}）: ${msg}`)
      return { error: msg }
    }
  }

  async transcribePdfFirstPageVision(pdfPath: string): Promise<PdfFirstPageVisionOutcome> {
    const png = await this.renderPdfFirstPagePng(pdfPath)
    if ('error' in png) {
      return { outcome: 'pdf_render', error: png.error }
    }
    const cfg = await this.resolveVisionModel()
    if (!cfg) {
      return {
        outcome: 'vision_api',
        error: '视觉模型在转图后不可用（请确认模型仍启用且已配置有效 API Key）',
      }
    }
    try {
      const text = await this.transcribeImageBuffer(cfg, png.buffer, 'image/png')
      if (!text) {
        return { outcome: 'vision_api', error: '视觉模型返回内容为空' }
      }
      return { text, modelName: cfg.name, outcome: 'success' }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      this.logger.warn(`PDF 首页视觉解析失败: ${msg}`)
      return { outcome: 'vision_api', error: msg }
    }
  }
}
