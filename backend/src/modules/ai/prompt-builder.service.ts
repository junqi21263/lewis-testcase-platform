import { Injectable, BadRequestException } from '@nestjs/common'
import { PrismaService } from '@/prisma/prisma.service'
import { GenerateDto } from './dto/generate.dto'

type BuiltPrompt = {
  system: string
  user: string
  resolvedTemplateId?: string
}

function clampPercent(n: number) {
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(100, Math.round(n)))
}

function safeReplaceVars(template: string, vars: Record<string, string>): string {
  let out = template
  for (const [k, v] of Object.entries(vars)) {
    // 支持 {{var}} 形式（与现有模板一致）
    out = out.split(`{{${k}}}`).join(v)
  }
  return out
}

@Injectable()
export class PromptBuilderService {
  constructor(private prisma: PrismaService) {}

  /**
   * 统一在后端构建 Prompt，避免前端篡改。
   * - templateId 优先，其次 customPrompt
   * - generationOptions / userNotes 参与变量替换与上下文拼接
   */
  async build(dto: GenerateDto, requirement: string): Promise<BuiltPrompt> {
    const system = `你是资深测试架构师与接口测试专家，精通测试用例设计方法与行业规范。\n` +
      `你必须输出严格的 JSON（不要 markdown 代码块），并确保结构可解析。\n` +
      `输出 JSON 顶层字段：\n` +
      `- coverage: { coveredPoints: string[], uncoveredPoints?: string[], coveragePercent: number }\n` +
      `- cases: Array<{\n` +
      `  id: string,\n` +
      `  module: string,\n` +
      `  precondition: string,\n` +
      `  steps: string[],\n` +
      `  expected: string,\n` +
      `  priority: \"P0\"|\"P1\"|\"P2\"|\"P3\"|\"P4\",\n` +
      `  testData: string\n` +
      `}>\n` +
      `- quality: { score: number, suggestions: string[] }\n`

    const opts = dto.generationOptions
    const normal = clampPercent(opts?.sceneNormal ?? 40)
    const abnormal = clampPercent(opts?.sceneAbnormal ?? 30)
    const boundary = clampPercent(opts?.sceneBoundary ?? 30)
    const testType = opts?.testType || 'FUNCTIONAL'
    const granularity = opts?.granularity || 'DETAILED'
    const priorityRule = opts?.priorityRule || ''
    const language = dto.outputLanguage || '中文'

    const vars: Record<string, string> = {
      content: requirement,
      testType,
      granularity,
      normalPercent: String(normal),
      abnormalPercent: String(abnormal),
      boundaryPercent: String(boundary),
      language,
      priorityRule,
    }

    let base = dto.customPrompt?.trim() || ''
    let resolvedTemplateId: string | undefined

    if (dto.templateId?.trim()) {
      const tpl = await this.prisma.promptTemplate.findUnique({ where: { id: dto.templateId.trim() } })
      if (!tpl) throw new BadRequestException('提示词模板不存在')
      resolvedTemplateId = tpl.id
      base = tpl.content
    }

    if (!base) {
      throw new BadRequestException('缺少提示词模板或自定义 Prompt')
    }

    const rendered = safeReplaceVars(base, vars)
    const notes = dto.userNotes?.trim()

    const user =
      `${rendered}\n\n` +
      (notes ? `# 补充说明\n${notes}\n\n` : '') +
      `# 输入内容\n${requirement}\n`

    return { system, user, resolvedTemplateId }
  }
}

