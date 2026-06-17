export type AnalysisRiskLevel = 'high' | 'medium' | 'low' | 'unknown'

export type AnalysisInterfaceRequirement = {
  module: string
  name: string
  method: string
  path: string
  description: string
}

export type AnalysisFlow = {
  type: 'mermaid'
  diagram: string
}

export type AnalysisRisk = {
  level: AnalysisRiskLevel
  description: string
  mitigation?: string
}

export type AnalysisStructuredQuality = {
  isPass: boolean
  score: number
  missingSections: string[]
  repairHints: string[]
}

export type AnalysisStructuredResult = {
  summary: string
  functionalRequirements: string[]
  nonFunctionalRequirements: string[]
  requirementDescription: string
  supplementaryNotes: string
  interfaces: AnalysisInterfaceRequirement[]
  dataModels: string[]
  flows: AnalysisFlow[]
  risks: AnalysisRisk[]
  testFocus: string[]
  openQuestions: string[]
  quality: AnalysisStructuredQuality
}

const SECTION_MATCHERS = {
  functionalRequirements: [/主要功能需求/i, /Functional Requirements/i],
  nonFunctionalRequirements: [/非功能需求/i, /Non-Functional Requirements/i],
  requirementDescription: [/^需求描述\b/i, /Requirement Description/i],
  supplementaryNotes: [/^补充说明\b/i, /Supplementary Notes/i],
  interfaces: [/接口需求/i, /Interface Requirements/i],
  dataModels: [/数据模型/i, /Data Model/i],
  flows: [/业务流程分析/i, /Business Process Analysis/i],
  risks: [/风险与建议/i, /Risks? & Mitigation/i],
}

const REQUIRED_SECTIONS: Array<keyof typeof SECTION_MATCHERS> = [
  'functionalRequirements',
  'nonFunctionalRequirements',
  'requirementDescription',
  'supplementaryNotes',
  'interfaces',
  'dataModels',
  'flows',
  'risks',
]

function splitLines(markdown: string): string[] {
  return markdown.replace(/\r\n/g, '\n').split('\n')
}

function normalizeTitle(line: string): string {
  return line.replace(/^##\s+/, '').replace(/^\d+[.)、]\s*/, '').trim()
}

function isH2(line: string): boolean {
  return /^##\s+/.test(line) && !/^###/.test(line)
}

function section(markdown: string, matchers: RegExp[]): string {
  const lines = splitLines(markdown)
  let start = -1
  for (let i = 0; i < lines.length; i++) {
    if (!isH2(lines[i])) continue
    const title = normalizeTitle(lines[i])
    if (matchers.some((re) => re.test(title))) {
      start = i + 1
      break
    }
  }
  if (start < 0) return ''
  const body: string[] = []
  for (let i = start; i < lines.length; i++) {
    if (isH2(lines[i])) break
    body.push(lines[i])
  }
  return body.join('\n').trim()
}

function stripMarkdownInline(s: string): string {
  return s
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^\s*[-*•]\s+/, '')
    .trim()
}

function listItems(text: string): string[] {
  return splitLines(text)
    .map((line) => line.trim())
    .filter((line) => /^(?:[-*•]|\d+[.)、])\s+/.test(line))
    .map(stripMarkdownInline)
    .filter((line) => line.length > 0)
}

function paragraphs(text: string): string[] {
  return text
    .split(/\n{2,}/)
    .map((p) => stripMarkdownInline(p.replace(/\n+/g, ' ')))
    .filter((p) => p.length > 0)
}

function parseMarkdownTableRows(text: string): string[][] {
  return splitLines(text)
    .map((line) => line.trim())
    .filter((line) => line.startsWith('|') && line.endsWith('|'))
    .map((line) =>
      line
        .slice(1, -1)
        .split('|')
        .map((cell) => stripMarkdownInline(cell)),
    )
    .filter((cells) => cells.length >= 4 && !cells.every((cell) => /^:?-{2,}:?$/.test(cell)))
}

function parseInterfaces(text: string): AnalysisInterfaceRequirement[] {
  const rows = parseMarkdownTableRows(text)
  if (rows.length < 2) return []
  return rows.slice(1).map((cells) => ({
    module: cells[0] || '',
    name: cells[1] || '',
    method: (cells[2] || '').toUpperCase(),
    path: cells[3] || '',
    description: cells[4] || '',
  })).filter((row) => row.name || row.path)
}

function extractMermaidFlows(text: string): AnalysisFlow[] {
  const flows: AnalysisFlow[] = []
  const re = /```mermaid\s*([\s\S]*?)```/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const diagram = m[1].trim()
    if (diagram) flows.push({ type: 'mermaid', diagram })
  }
  return flows
}

function classifyRiskLevel(line: string): AnalysisRiskLevel {
  if (/高风险|High|\bhigh\b/i.test(line)) return 'high'
  if (/中风险|Medium|\bmedium\b/i.test(line)) return 'medium'
  if (/低风险|Low|\blow\b/i.test(line)) return 'low'
  return 'unknown'
}

function parseRisks(text: string): AnalysisRisk[] {
  return listItems(text).map((line) => {
    const clean = stripMarkdownInline(line)
    const [description, mitigation] = clean.split(/建议[:：]/)
    return {
      level: classifyRiskLevel(clean),
      description: (description || clean).trim(),
      ...(mitigation?.trim() ? { mitigation: mitigation.trim() } : {}),
    }
  })
}

export function validateAnalysisStructuredResult(
  result: Omit<AnalysisStructuredResult, 'quality'> | AnalysisStructuredResult,
): AnalysisStructuredQuality {
  const missingSections: string[] = []
  if (!result.functionalRequirements.length) missingSections.push('functionalRequirements')
  if (!result.nonFunctionalRequirements.length) missingSections.push('nonFunctionalRequirements')
  if (!result.requirementDescription.trim()) missingSections.push('requirementDescription')
  if (!result.supplementaryNotes.trim()) missingSections.push('supplementaryNotes')
  if (!result.interfaces.length) missingSections.push('interfaces')
  if (!result.dataModels.length) missingSections.push('dataModels')
  if (!result.flows.length) missingSections.push('flows')
  if (!result.risks.length) missingSections.push('risks')

  const score = Math.max(0, Math.round(((REQUIRED_SECTIONS.length - missingSections.length) / REQUIRED_SECTIONS.length) * 100))
  const repairHints = missingSections.map((item) => `补齐 ${item} 章节，并保持 Markdown 二级标题结构稳定。`)
  return {
    isPass: missingSections.length === 0,
    score,
    missingSections,
    repairHints,
  }
}

export function buildAnalysisStructuredResult(markdown: string): AnalysisStructuredResult {
  const functionalText = section(markdown, SECTION_MATCHERS.functionalRequirements)
  const nonFunctionalText = section(markdown, SECTION_MATCHERS.nonFunctionalRequirements)
  const requirementDescription = section(markdown, SECTION_MATCHERS.requirementDescription)
  const supplementaryNotes = section(markdown, SECTION_MATCHERS.supplementaryNotes)
  const interfaceText = section(markdown, SECTION_MATCHERS.interfaces)
  const dataModelText = section(markdown, SECTION_MATCHERS.dataModels)
  const flowText = section(markdown, SECTION_MATCHERS.flows)
  const riskText = section(markdown, SECTION_MATCHERS.risks)

  const base: Omit<AnalysisStructuredResult, 'quality'> = {
    summary: paragraphs(requirementDescription)[0] || paragraphs(markdown)[0] || '',
    functionalRequirements: listItems(functionalText),
    nonFunctionalRequirements: listItems(nonFunctionalText),
    requirementDescription: requirementDescription.trim(),
    supplementaryNotes: supplementaryNotes.trim(),
    interfaces: parseInterfaces(interfaceText),
    dataModels: listItems(dataModelText).length ? listItems(dataModelText) : paragraphs(dataModelText),
    flows: extractMermaidFlows(flowText),
    risks: parseRisks(riskText),
    testFocus: [],
    openQuestions: [],
  }
  return {
    ...base,
    quality: validateAnalysisStructuredResult(base),
  }
}

export function buildAnalysisRepairPrompt(markdown: string, quality: AnalysisStructuredQuality): string {
  return `以下 AI 需求分析报告未通过结构化质量校验，请在不编造需求的前提下修复为完整 Markdown 报告。

必须保留并补齐这 8 个二级标题：
1. 主要功能需求 (Functional Requirements)
2. 非功能需求 (Non-Functional Requirements)
3. 需求描述 (Requirement Description)
4. 补充说明 (Supplementary Notes)
5. 接口需求 (Interface Requirements)
6. 数据模型 (Data Model)
7. 业务流程分析 (Business Process Analysis)
8. 风险与建议 (Risks & Mitigation)

当前缺失/不合格项：
${quality.repairHints.map((x) => `- ${x}`).join('\n')}

原报告：
${markdown}`
}
