import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import OpenAI from 'openai'
import * as fs from 'fs'
import type { AIModelConfig } from '@prisma/client'
import { PrismaService } from '@/prisma/prisma.service'

const VISION_USER_PROMPT = `你正在为「测试用例生成平台」提取需求信息。请根据当前画面中的内容（可能含：界面截图、手绘、表格、发票、需求文档照片、扫描件、PDF 页面截图等），输出一段**结构化、可直接作为测试需求依据的中文描述**。

要求：
1. 列出可见的主要模块/页面、按钮、输入项、关键文案与状态。
2. 若有流程或步骤，按顺序说明。
3. 如有数字、规则、边界条件、报错提示，请尽量保留原意。
4. 不要编造图中没有的信息；看不清处可写「图中未标明」。
5. 输出纯文本段落，不要使用 Markdown 代码块包裹全文。`

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

  async transcribeImageBuffer(cfg: AIModelConfig, buffer: Buffer, mimeType: string): Promise<string> {
    const base64 = buffer.toString('base64')
    const dataUrl = `data:${mimeType};base64,${base64}`
    const client = this.openaiFor(cfg)
    const maxTokens = Math.min(cfg.maxTokens || 4096, 8192)
    const completion = await client.chat.completions.create({
      model: cfg.modelId,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: VISION_USER_PROMPT },
            { type: 'image_url', image_url: { url: dataUrl, detail: 'high' } },
          ],
        },
      ],
      max_tokens: maxTokens,
      temperature: Math.min(cfg.temperature ?? 0.3, 0.7),
    })
    return (completion.choices[0]?.message?.content || '').trim()
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
