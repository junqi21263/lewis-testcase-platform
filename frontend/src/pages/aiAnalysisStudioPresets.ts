/**
 * AI 需求分析页 — 分析指令模板预设（纯前端，不改变接口）
 */
import { AI_ANALYSIS_PROMPT_DEFAULT } from './aiAnalysisPromptDefault'

export type AnalysisPromptPreset = {
  id: string
  name: string
  scenario: string
  shortDesc: string
  outputStyle: string
  body: string
}

const LIGHTWEIGHT_BODY = `# 角色设定
你是一位资深产品经理与业务分析师。

# 任务目标
请阅读【需求文档内容】后，用 Markdown 输出一份**精简**分析，控制在合理篇幅内，包含：
1. **需求摘要**：一句话目标 + 关键干系人假设（如有）
2. **核心功能**：按模块列出 5–12 条要点（项目符号）
3. **非功能关注点**：性能、安全、可用性、兼容性中**确实相关**的条目（无则写「未明确提及」）
4. **风险与歧义**：列出 3–8 条，并标注「高/中/低」影响
5. **建议测试方向**：3–6 条可落地的验证思路

# 输出要求
- 使用 Markdown；避免冗长表格；不要输出 Mermaid（除非文档已给出且确有必要）。
- 若信息不足，请明确写出「待补充」项，而不是臆造细节。
`

const TECHNICAL_BODY = `# 角色设定
你是一位资深系统架构师，擅长从需求材料中抽取可实施的技术视图。

# 任务目标
请对【需求文档内容】进行分析，输出以下 Markdown 结构（可适当省略无关章节，但标题需保留）：

## 1. 系统上下文与边界
## 2. 核心领域对象与状态
## 3. 接口草案（Markdown 表格：模块 | 接口 | Method | Path | 说明）
## 4. 数据与一致性要点
## 5. 关键流程（如材料支持，请给出 Mermaid flowchart）
## 6. 技术风险与依赖

# 输出要求
- 以可开发评审为目标；避免营销化措辞。
- 表格与 Mermaid 仅在确有信息时填写。
`

export const ANALYSIS_PROMPT_PRESETS: AnalysisPromptPreset[] = [
  {
    id: 'standard',
    name: '标准结构化报告',
    scenario: 'PRD、方案书、招标文件',
    shortDesc: '六段式深度分析，含接口表与 Mermaid 流程',
    outputStyle: '完整 Markdown 章节',
    body: AI_ANALYSIS_PROMPT_DEFAULT,
  },
  {
    id: 'lightweight',
    name: '快速摘要',
    scenario: '会议纪要、邮件需求、短文档',
    shortDesc: '短篇幅：摘要、功能要点、风险与测试方向',
    outputStyle: '精简 Markdown',
    body: LIGHTWEIGHT_BODY,
  },
  {
    id: 'technical',
    name: '技术视角深挖',
    scenario: '研发评审、架构评估',
    shortDesc: '边界、对象、接口草案、流程与依赖',
    outputStyle: '技术结构化 Markdown',
    body: TECHNICAL_BODY,
  },
]

const RECENT_PRESET_KEY = 'ai-analysis-preset-recent-v1'

export function readRecentPresetIds(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_PRESET_KEY)
    const arr = raw ? (JSON.parse(raw) as unknown) : []
    if (!Array.isArray(arr)) return []
    return arr.filter((x): x is string => typeof x === 'string')
  } catch {
    return []
  }
}

export function touchRecentPresetId(id: string) {
  try {
    const prev = readRecentPresetIds().filter((x) => x !== id)
    const next = [id, ...prev].slice(0, 6)
    localStorage.setItem(RECENT_PRESET_KEY, JSON.stringify(next))
  } catch {
    /* ignore */
  }
}

export function findPresetIdForBody(body: string): string | null {
  const t = body.trim()
  for (const p of ANALYSIS_PROMPT_PRESETS) {
    if (p.body.trim() === t) return p.id
  }
  return null
}
