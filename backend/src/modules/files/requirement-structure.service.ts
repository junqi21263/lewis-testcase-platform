import { Injectable, Logger } from '@nestjs/common'
import OpenAI from 'openai'
import { PrismaService } from '@/prisma/prisma.service'

/** 文档类全文 → 结构化需求（与下游测试用例生成衔接）；输入可能含 OCR/多模态解析噪声 */
const STRUCTURE_SYSTEM = `# 角色
你是专业的软件测试需求分析师，精通需求文档结构化处理，能从长文本需求文档中，精准提炼出可测试的业务需求点，拆分结构化条目，过滤冗余信息，保障需求的完整性与可执行性。

# 核心任务
基于用户提供的需求文档全文本，完成结构化需求提取，严格按照输出格式返回结果，用于测试用例生成。输入可能来自 Word/PDF/文本提取或 OCR，允许含噪声，须按「处理规则」净化后再输出。

# 处理规则
1. 过滤无效内容：目录、前言、修订记录、排版符号、页眉页脚、页码、与业务需求无关的冗余描述；OCR 乱码行、无意义符号串、水印文案、引擎标签整行（如含「OCR」「Tesseract」「多模态视觉理解」等）。
2. 结构化拆分：按业务模块、功能点拆分独立的需求条目，每条需求对应一个独立的功能点/业务规则。
3. 需求标准化：每条需求必须完整、通顺、无歧义，包含业务操作、规则约束、预期效果，可直接用于编写测试用例。
4. 保留核心信息：不遗漏业务规则、前置条件、权限要求、异常处理规则、边界条件、兼容要求等核心测试相关内容。
5. 去重合并：重复的需求点自动合并，相似的需求点按业务逻辑归类，避免冗余。
6. 安全与真实：不要编造文中没有的需求；不要输出完整手机号、身份证号、银行卡号；若原文已脱敏（含 ****）可保留脱敏形式。
7. 若经判定几乎无可提取的有效需求，设 is_valid 为 false，demand_list 可为空数组，并在 msg 中简要说明原因。

# 输出格式（必须严格遵循 JSON，键名使用英文；禁止输出 JSON 以外的任何字符、不要 Markdown 代码块）
{
  "is_valid": true,
  "demand_list": [
    "这里是第一条结构化需求点",
    "这里是第二条结构化需求点"
  ],
  "original_text": "这里是过滤无效内容后的完整需求原文，保留核心段落结构，与 demand_list 语义对应",
  "msg": "解析成功或解析失败的提示信息"
}`

export type StructureRequirementsResult = {
  /** 入库到 structuredRequirements 的条目 */
  requirements: string[]
  /** 模型清洗后的正文；有值时优先作为 parsedContent 存储 */
  cleanedText?: string
}

@Injectable()
export class RequirementStructureService {
  private readonly logger = new Logger(RequirementStructureService.name)

  constructor(private prisma: PrismaService) {}

  /**
   * 将脱敏后的文档全文转为结构化需求条目；LLM 不可用时走规则兜底。
   */
  async structureRequirements(maskedDocumentText: string): Promise<StructureRequirementsResult> {
    const text = maskedDocumentText.trim()
    if (!text) return { requirements: [] }

    const cfg = await this.prisma.aIModelConfig.findFirst({
      where: { isDefault: true, isActive: true },
    })

    if (!cfg?.apiKey || cfg.apiKey === 'placeholder') {
      return { requirements: this.fallbackStructure(text) }
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
      const parsed = JSON.parse(raw) as {
        is_valid?: boolean
        demand_list?: unknown
        original_text?: unknown
        msg?: unknown
        requirements?: unknown
      }

      const rawList = Array.isArray(parsed.demand_list)
        ? parsed.demand_list
        : Array.isArray(parsed.requirements)
          ? parsed.requirements
          : null

      if (!Array.isArray(rawList)) {
        this.logger.warn('需求结构化：模型未返回 demand_list，使用规则兜底')
        return { requirements: this.fallbackStructure(text) }
      }

      const requirements = rawList
        .map((x) => (typeof x === 'string' ? x.trim() : String(x)))
        .filter((s) => s.length > 2 && !this.isNoiseLine(s))
        .slice(0, 80)

      if (parsed.is_valid === false && requirements.length === 0) {
        const hint = typeof parsed.msg === 'string' ? parsed.msg : '模型判定无有效需求'
        this.logger.warn(`需求结构化：is_valid=false，${hint}`)
      }

      let cleanedText: string | undefined
      if (typeof parsed.original_text === 'string') {
        const o = parsed.original_text.trim()
        if (o.length > 0) cleanedText = o
      }

      if (typeof parsed.msg === 'string' && parsed.msg.trim() && requirements.length === 0 && !cleanedText) {
        this.logger.debug(`需求结构化 msg: ${parsed.msg.trim()}`)
      }

      return { requirements, cleanedText }
    } catch (e) {
      this.logger.warn(`需求结构化 LLM 失败，使用规则兜底: ${(e as Error).message}`)
      return { requirements: this.fallbackStructure(text) }
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
