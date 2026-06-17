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

export type AnalysisRequirement = {
  id: string
  text: string
  type: 'functional' | 'nonFunctional' | 'risk' | 'unknown'
}

export type AnalysisFlowchartNode = {
  id: string
  label: string
  type: 'start' | 'process' | 'decision' | 'end'
}

export type AnalysisFlowchartBranch = {
  from: string
  condition: string
  to: string
  type: 'success' | 'exception' | 'neutral'
}

export type AnalysisFlowchartPath = {
  id: string
  type: 'main' | 'exception'
  nodes: string[]
}

export type AnalysisFlowchartSummary = {
  nodes: AnalysisFlowchartNode[]
  branches: AnalysisFlowchartBranch[]
  paths: AnalysisFlowchartPath[]
}

export type AnalysisOpenQuestion = {
  id: string
  category: 'role' | 'boundary' | 'exception' | 'permission' | 'data' | 'interface' | 'unknown'
  text: string
}

export type AnalysisInputWarning = {
  type: 'text_too_short' | 'ocr_garbled' | 'flow_nodes_too_few' | 'flow_branches_too_few' | 'interfaces_missing' | 'risks_missing'
  message: string
}

export type AnalysisQualityScores = {
  completeness: number
  testability: number
  interfaceClarity: number
  riskCoverage: number
  flowCompleteness: number
  overall: number
  reasons: string[]
}

export type AnalysisTestStrategy = {
  scope: string[]
  types: string[]
  entryCriteria: string[]
  exitCriteria: string[]
}

export type AnalysisAutomationReadiness = {
  automatable: string[]
  manual: string[]
  missingEnvironment: string[]
}

export type AnalysisCrossReviewStatus = 'pending' | 'running' | 'success' | 'skipped' | 'failed'

export type AnalysisCrossReview = {
  status: AnalysisCrossReviewStatus
  modelName?: string
  differences: string[]
  mergedSuggestions: string[]
  error?: string
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
  requirements: AnalysisRequirement[]
  functionalRequirements: string[]
  nonFunctionalRequirements: string[]
  requirementDescription: string
  supplementaryNotes: string
  interfaces: AnalysisInterfaceRequirement[]
  dataModels: string[]
  flows: AnalysisFlow[]
  flowchart: AnalysisFlowchartSummary
  risks: AnalysisRisk[]
  testFocus: string[]
  openQuestions: AnalysisOpenQuestion[]
  inputWarnings: AnalysisInputWarning[]
  qualityScores: AnalysisQualityScores
  testStrategy: AnalysisTestStrategy
  automationReadiness: AnalysisAutomationReadiness
  crossReview: AnalysisCrossReview
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
  openQuestions: [/待确认问题/i, /Open Questions/i],
  testStrategy: [/测试策略/i, /Test Strategy/i],
  automationReadiness: [/Agent 执行准备清单/i, /自动化准备/i, /Automation Readiness/i],
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

function seqId(prefix: string, index: number): string {
  return `${prefix}-${String(index + 1).padStart(3, '0')}`
}

function buildRequirements(functional: string[], nonFunctional: string[], risks: AnalysisRisk[]): AnalysisRequirement[] {
  const rows: AnalysisRequirement[] = []
  for (const text of functional) rows.push({ id: seqId('REQ', rows.length), text, type: 'functional' })
  for (const text of nonFunctional) rows.push({ id: seqId('REQ', rows.length), text, type: 'nonFunctional' })
  for (const risk of risks.filter((r) => r.level === 'high')) {
    rows.push({ id: seqId('REQ', rows.length), text: risk.description, type: 'risk' })
  }
  return rows
}

function cleanNodeToken(input: string): string {
  return stripMarkdownInline(input)
    .replace(/^flowchart\s+(TD|LR|BT|RL)\s*/i, '')
    .replace(/^[A-Za-z0-9_]+\s*[\[{(（]([^\]\})）]+)[\]\})）]$/, '$1')
    .replace(/^[A-Za-z0-9_]+$/, '')
    .replace(/[;；]+$/g, '')
    .trim()
}

function branchType(condition: string, to: string): AnalysisFlowchartBranch['type'] {
  if (/否|失败|错误|异常|拒绝|驳回|无权限|超时|取消/.test(`${condition}${to}`)) return 'exception'
  if (/是|成功|完成|通过|允许/.test(`${condition}${to}`)) return 'success'
  return 'neutral'
}

function nodeType(label: string): AnalysisFlowchartNode['type'] {
  if (/开始|打开|入口|start/i.test(label)) return 'start'
  if (/结束|完成|成功|进入首页|end/i.test(label)) return 'end'
  if (/是否|判断|校验|检查|\?|？/.test(label)) return 'decision'
  return 'process'
}

function resolveNodeLabel(input: string, nodeLabelMap: Map<string, string>): string {
  const raw = stripMarkdownInline(input).replace(/[;；]+$/g, '').trim()
  const byId = nodeLabelMap.get(raw)
  if (byId) return byId
  const cleaned = cleanNodeToken(raw)
  return nodeLabelMap.get(cleaned) ?? cleaned
}

function buildFlowchart(flows: AnalysisFlow[]): AnalysisFlowchartSummary {
  const branches: AnalysisFlowchartBranch[] = []
  const nodes = new Map<string, AnalysisFlowchartNode>()
  const nodeLabelMap = new Map<string, string>()

  for (const flow of flows) {
    for (const match of flow.diagram.matchAll(/([A-Za-z0-9_]+)\s*[\[{(（]([^\]\})）]+)[\]\})）]/g)) {
      const id = match[1].trim()
      const label = stripMarkdownInline(match[2])
      if (id && label) nodeLabelMap.set(id, label)
    }
    const lines = flow.diagram.split('\n').map((l) => l.trim()).filter(Boolean)
    for (const line of lines) {
      if (!/(-->|->)/.test(line)) continue
      const labeled = line.match(/^(.+?)\s*-->\s*\|([^|]+)\|\s*(.+)$/)
      const dashed = line.match(/^(.+?)\s*--\s*([^->]+?)\s*-->\s*(.+)$/)
      const simple = line.match(/^(.+?)\s*(?:-->|->)\s*(.+)$/)
      const match = labeled || dashed || simple
      if (!match) continue
      const from = resolveNodeLabel(match[1], nodeLabelMap)
      const toRaw = labeled || dashed ? match[3] : match[2]
      const to = resolveNodeLabel(toRaw, nodeLabelMap)
      const condition = labeled || dashed ? cleanNodeToken(match[2]) || '默认' : '默认'
      if (!from || !to || from === to) continue
      for (const label of [from, to]) {
        if (!nodes.has(label)) {
          nodes.set(label, { id: `N-${String(nodes.size + 1).padStart(3, '0')}`, label, type: nodeType(label) })
        }
      }
      branches.push({ from, to, condition, type: branchType(condition, to) })
    }
  }

  const dedupedBranches = branches.filter((b, i, arr) =>
    arr.findIndex((x) => x.from === b.from && x.to === b.to && x.condition === b.condition) === i,
  )
  const incoming = new Set(dedupedBranches.map((b) => b.to))
  let current = dedupedBranches.find((b) => !incoming.has(b.from))?.from ?? dedupedBranches[0]?.from ?? ''
  const mainNodes = current ? [current] : []
  const visited = new Set(mainNodes)
  for (let i = 0; i < 80 && current; i++) {
    const next = dedupedBranches.find((b) => b.from === current && b.type !== 'exception') ?? dedupedBranches.find((b) => b.from === current)
    if (!next || visited.has(next.to)) break
    mainNodes.push(next.to)
    visited.add(next.to)
    current = next.to
  }

  const paths: AnalysisFlowchartPath[] = []
  if (mainNodes.length) paths.push({ id: seqId('TP', paths.length), type: 'main', nodes: mainNodes })
  for (const b of dedupedBranches.filter((x) => x.type === 'exception')) {
    paths.push({ id: seqId('TP', paths.length), type: 'exception', nodes: [b.from, b.to] })
  }

  return { nodes: [...nodes.values()], branches: dedupedBranches, paths }
}

function classifyQuestion(text: string): AnalysisOpenQuestion['category'] {
  if (/角色|用户|管理员|普通用户/.test(text)) return 'role'
  if (/边界|范围|限制|上限|下限/.test(text)) return 'boundary'
  if (/异常|失败|错误|超时|重试/.test(text)) return 'exception'
  if (/权限|授权|无权/.test(text)) return 'permission'
  if (/数据|状态|字段/.test(text)) return 'data'
  if (/接口|API|路径|参数/.test(text)) return 'interface'
  return 'unknown'
}

function buildOpenQuestions(markdown: string, explicitText: string): AnalysisOpenQuestion[] {
  const explicit = listItems(explicitText)
  const inferred: string[] = []
  const source = markdown.replace(/\s+/g, '')
  const checks: Array<[RegExp, string]> = [
    [/角色|用户|管理员/, '角色边界待确认：不同角色是否拥有相同操作权限？'],
    [/权限|无权限/, '权限规则待确认：哪些角色允许访问、编辑或审批？'],
    [/异常|失败|错误|超时/, '异常路径待确认：失败、超时、重试和兜底提示是否有统一规则？'],
    [/状态|数据/, '数据状态待确认：前置数据、状态流转和边界数据是否已定义？'],
    [/接口|API/, '接口约束待确认：请求方法、路径、参数、错误码和幂等规则是否明确？'],
  ]
  for (const [re, q] of checks) {
    if (re.test(source) && !explicit.some((x) => x.includes(q.slice(0, 4)))) inferred.push(q)
  }
  return [...new Set([...explicit, ...inferred])]
    .slice(0, 20)
    .map((text, i) => ({ id: seqId('Q', i), category: classifyQuestion(text), text }))
}

function garbledRatio(text: string): number {
  const compact = text.replace(/\s/g, '')
  if (!compact) return 0
  const bad = (compact.match(/[�□■●◆◇]/g) ?? []).length
  return bad / compact.length
}

function buildInputWarnings(markdown: string, flowchart: AnalysisFlowchartSummary, interfaces: AnalysisInterfaceRequirement[], risks: AnalysisRisk[]): AnalysisInputWarning[] {
  const warnings: AnalysisInputWarning[] = []
  const textLen = markdown.replace(/\s/g, '').length
  if (textLen > 0 && textLen < 120) warnings.push({ type: 'text_too_short', message: '需求文本过短，建议补充角色、流程、异常和接口约束后再分析。' })
  if (garbledRatio(markdown) > 0.03) warnings.push({ type: 'ocr_garbled', message: 'OCR 乱码率偏高，建议重新解析或上传更清晰文件。' })
  if (flowchart.nodes.length > 0 && flowchart.nodes.length < 3) warnings.push({ type: 'flow_nodes_too_few', message: '流程图节点过少，可能无法覆盖完整主流程。' })
  if (flowchart.nodes.length > 0 && flowchart.branches.length < 1) warnings.push({ type: 'flow_branches_too_few', message: '流程图缺少分支信息，异常路径覆盖可能不足。' })
  if (interfaces.length === 0) warnings.push({ type: 'interfaces_missing', message: '未识别到接口需求，接口测试策略可能不完整。' })
  if (risks.length === 0) warnings.push({ type: 'risks_missing', message: '未识别到风险与建议，风险覆盖度评分会降低。' })
  return warnings
}

function scoreBy(condition: boolean, penaltyReason: string, reasons: string[], full = 100, low = 55): number {
  if (condition) return full
  reasons.push(penaltyReason)
  return low
}

function buildQualityScores(base: {
  quality: AnalysisStructuredQuality
  requirements: AnalysisRequirement[]
  interfaces: AnalysisInterfaceRequirement[]
  risks: AnalysisRisk[]
  flowchart: AnalysisFlowchartSummary
  openQuestions: AnalysisOpenQuestion[]
}): AnalysisQualityScores {
  const reasons: string[] = []
  const completeness = base.quality.score
  const testability = Math.round((base.requirements.length ? 70 : 40) + (base.openQuestions.length ? 10 : 0) + (base.flowchart.paths.length ? 20 : 0))
  const interfaceClarity = scoreBy(base.interfaces.length > 0, '缺少接口方法、路径或说明。', reasons, 100, 45)
  const riskCoverage = scoreBy(base.risks.length > 0, '缺少风险与建议。', reasons, 100, 50)
  const flowCompleteness = scoreBy(base.flowchart.nodes.length >= 3 && base.flowchart.paths.length > 0, '流程图节点或路径不足。', reasons, 100, base.flowchart.nodes.length ? 60 : 35)
  if (base.requirements.length === 0) reasons.push('缺少可追踪的需求点。')
  const overall = Math.round((completeness + testability + interfaceClarity + riskCoverage + flowCompleteness) / 5)
  return { completeness, testability: Math.min(100, testability), interfaceClarity, riskCoverage, flowCompleteness, overall, reasons }
}

function parseStrategy(text: string): AnalysisTestStrategy {
  const items = listItems(text)
  const pick = (label: RegExp) =>
    items
      .filter((item) => label.test(item))
      .flatMap((item) => item.replace(/^.*?[：:]/, '').split(/[、,，]/))
      .map((x) => x.trim())
      .filter(Boolean)
  return {
    scope: pick(/范围|scope/i),
    types: pick(/类型|type/i),
    entryCriteria: pick(/准入|entry/i),
    exitCriteria: pick(/准出|exit/i),
  }
}

function parseAutomationReadiness(text: string): AnalysisAutomationReadiness {
  const items = listItems(text)
  const pick = (label: RegExp) =>
    items
      .filter((item) => label.test(item))
      .flatMap((item) => item.replace(/^.*?[：:]/, '').split(/[、,，]/))
      .map((x) => x.trim())
      .filter(Boolean)
  return {
    automatable: pick(/可自动化|automatable/i),
    manual: pick(/人工|manual/i),
    missingEnvironment: pick(/缺环境|环境|missing/i),
  }
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
  const openQuestionText = section(markdown, SECTION_MATCHERS.openQuestions)
  const testStrategyText = section(markdown, SECTION_MATCHERS.testStrategy)
  const automationText = section(markdown, SECTION_MATCHERS.automationReadiness)
  const risks = parseRisks(riskText)
  const flows = extractMermaidFlows(flowText)
  const flowchart = buildFlowchart(flows)
  const functionalRequirements = listItems(functionalText)
  const nonFunctionalRequirements = listItems(nonFunctionalText)
  const interfaces = parseInterfaces(interfaceText)
  const qualityBase = validateAnalysisStructuredResult({
    summary: '',
    functionalRequirements,
    nonFunctionalRequirements,
    requirementDescription,
    supplementaryNotes,
    interfaces,
    dataModels: listItems(dataModelText).length ? listItems(dataModelText) : paragraphs(dataModelText),
    flows,
    risks,
    testFocus: [],
    openQuestions: [],
    inputWarnings: [],
    requirements: [],
    flowchart,
    qualityScores: {} as AnalysisQualityScores,
    testStrategy: { scope: [], types: [], entryCriteria: [], exitCriteria: [] },
    automationReadiness: { automatable: [], manual: [], missingEnvironment: [] },
    crossReview: { status: 'pending', differences: [], mergedSuggestions: [] },
  })
  const requirements = buildRequirements(functionalRequirements, nonFunctionalRequirements, risks)
  const openQuestions = buildOpenQuestions(markdown, openQuestionText)

  const base: Omit<AnalysisStructuredResult, 'quality'> = {
    summary: paragraphs(requirementDescription)[0] || paragraphs(markdown)[0] || '',
    requirements,
    functionalRequirements,
    nonFunctionalRequirements,
    requirementDescription: requirementDescription.trim(),
    supplementaryNotes: supplementaryNotes.trim(),
    interfaces,
    dataModels: listItems(dataModelText).length ? listItems(dataModelText) : paragraphs(dataModelText),
    flows,
    flowchart,
    risks,
    testFocus: [],
    openQuestions,
    inputWarnings: buildInputWarnings(markdown, flowchart, interfaces, risks),
    qualityScores: buildQualityScores({
      quality: qualityBase,
      requirements,
      interfaces,
      risks,
      flowchart,
      openQuestions,
    }),
    testStrategy: parseStrategy(testStrategyText),
    automationReadiness: parseAutomationReadiness(automationText),
    crossReview: { status: 'pending', differences: [], mergedSuggestions: [] },
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
