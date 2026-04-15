import { Injectable, Logger } from '@nestjs/common'
import OpenAI from 'openai'
import { PrismaService } from '@/prisma/prisma.service'

const STRUCTURE_SYSTEM = `你是软件测试领域的需求分析助手。用户将提供一段从文档/截图 OCR/多模态解析得到的文本（可能含噪声）。
请输出一个 JSON 对象，格式严格为：{"requirements":["…","…"]}。

规则：
1. requirements 为数组，每一项是一条独立、完整、无歧义的中文业务需求描述（一句或一小段）。
2. 剔除：OCR 乱码行、无意义符号串、页码/页眉页脚、水印文案、引擎标签行（如含「OCR」「Tesseract」「多模态视觉理解」等标记的整行）、明显无关标识。
3. 不要输出完整手机号、身份证号、银行卡号；若文中已脱敏（含 ****）可保留脱敏形式。
4. 不要编造文中没有的需求；若无可提取的有效需求，返回空数组。
5. 仅输出 JSON，不要 Markdown 代码块或其它说明文字。`

@Injectable()
export class RequirementStructureService {
  private readonly logger = new Logger(RequirementStructureService.name)

  constructor(private prisma: PrismaService) {}

  /**
   * 将脱敏后的文档全文转为结构化需求条目；LLM 不可用时走规则兜底。
   */
  async structureRequirements(maskedDocumentText: string): Promise<string[]> {
    const text = maskedDocumentText.trim()
    if (!text) return []

    const cfg = await this.prisma.aIModelConfig.findFirst({
      where: { isDefault: true, isActive: true },
    })

    if (!cfg?.apiKey || cfg.apiKey === 'placeholder') {
      return this.fallbackStructure(text)
    }

    try {
      const client = new OpenAI({
        apiKey: cfg.apiKey,
        baseURL: cfg.baseUrl.replace(/\/+$/, ''),
      })
      const slice = text.length > 100_000 ? `${text.slice(0, 100_000)}\n\n…(已截断)` : text
      const completion = await client.chat.completions.create({
        model: cfg.modelId,
        messages: [
          { role: 'system', content: STRUCTURE_SYSTEM },
          { role: 'user', content: `待结构化内容如下：\n\n${slice}` },
        ],
        temperature: Math.min(cfg.temperature ?? 0.3, 0.45),
        max_tokens: Math.min(cfg.maxTokens ?? 4096, 8192),
        response_format: { type: 'json_object' },
      })
      const raw = completion.choices[0]?.message?.content?.trim() ?? ''
      const parsed = JSON.parse(raw) as { requirements?: unknown }
      const arr = parsed.requirements
      if (!Array.isArray(arr)) return this.fallbackStructure(text)
      return arr
        .map((x) => (typeof x === 'string' ? x.trim() : String(x)))
        .filter((s) => s.length > 2 && !this.isNoiseLine(s))
        .slice(0, 80)
    } catch (e) {
      this.logger.warn(`需求结构化 LLM 失败，使用规则兜底: ${(e as Error).message}`)
      return this.fallbackStructure(text)
    }
  }

  private isNoiseLine(s: string): boolean {
    return /【\s*OCR|【\s*多模态|Tesseract|水印|页码|^第\s*\d+\s*页\s*$/i.test(s.trim())
  }

  /** 与前端 extractRequirements 类似的轻量规则拆分（无 LLM 时） */
  private fallbackStructure(text: string): string[] {
    const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 2 && !this.isNoiseLine(l))

    const results: string[] = []
    const listPattern = /^(?:[-•*﹣▪▸►]|\d+[.)、]|[①②③④⑤⑥⑦⑧⑨⑩])\s+(.+)/

    const listLines = lines.filter((l) => listPattern.test(l))
    if (listLines.length >= 2) {
      for (const l of listLines) {
        const m = l.match(listPattern)
        if (m?.[1]) results.push(m[1].trim())
      }
    }

    if (results.length < 2) {
      const reqKeyword = /应该|需要|必须|不得|不能|禁止|支持|允许|可以|提供|实现|完成|保证|确保|具备/
      for (const line of lines) {
        const sentences = line.split(/[。；;]/).map((s) => s.trim()).filter(Boolean)
        for (const s of sentences) {
          if (reqKeyword.test(s) && s.length > 5) results.push(s)
        }
      }
    }

    if (results.length < 2) {
      for (const line of lines.slice(0, 40)) {
        if (line.length > 8 && !this.isNoiseLine(line)) results.push(line)
      }
    }

    return Array.from(new Set(results)).slice(0, 50)
  }
}
