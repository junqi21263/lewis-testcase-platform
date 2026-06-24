/**
 * 从 AI 需求分析 Markdown 报告中按 ## 标题提取章节正文（供生成用例跳转填表）。
 */

function splitLines(markdown: string): string[] {
  return markdown.replace(/\r\n/g, '\n').split('\n')
}

function isTopLevelH2(line: string): boolean {
  return /^##\s+/.test(line) && !/^###/.test(line)
}

/** 匹配 ## 标题行后，截取到下一个同级 ## 之前的正文 */
export function extractMarkdownH2Section(markdown: string, titleMatchers: RegExp[]): string {
  const lines = splitLines(markdown)
  let start = -1
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ''
    if (!isTopLevelH2(line)) continue
    const title = line.replace(/^##\s+/, '').trim()
    if (titleMatchers.some((re) => re.test(title))) {
      start = i + 1
      break
    }
  }
  if (start < 0) return ''
  const body: string[] = []
  for (let i = start; i < lines.length; i++) {
    const line = lines[i] ?? ''
    if (isTopLevelH2(line)) break
    body.push(line)
  }
  return body.join('\n').trim()
}

export type AnalysisReportHandoffFields = {
  functionalRequirements: string
  nonFunctionalRequirements: string
  requirementDescription: string
  supplementaryNotes: string
  /** 填入生成页「文本输入」：主要功能 + 非功能（便于总览） */
  combinedInputText: string
}

const RE_FUNCTIONAL = [/主要功能需求/i, /Functional Requirements/i]
const RE_NON_FUNCTIONAL = [/非功能需求/i, /Non-Functional Requirements/i]
const RE_REQUIREMENT_DESC = [/^需求描述\b/i, /Requirement Description/i]
const RE_SUPPLEMENT = [/^补充说明\b/i, /Supplementary Notes/i]

export function extractAnalysisReportHandoffFields(reportMarkdown: string): AnalysisReportHandoffFields {
  const functionalRequirements = extractMarkdownH2Section(reportMarkdown, RE_FUNCTIONAL)
  const nonFunctionalRequirements = extractMarkdownH2Section(reportMarkdown, RE_NON_FUNCTIONAL)
  let requirementDescription = extractMarkdownH2Section(reportMarkdown, RE_REQUIREMENT_DESC)
  let supplementaryNotes = extractMarkdownH2Section(reportMarkdown, RE_SUPPLEMENT)

  if (!requirementDescription && functionalRequirements) {
    requirementDescription = functionalRequirements
  }
  if (!supplementaryNotes && nonFunctionalRequirements) {
    supplementaryNotes = nonFunctionalRequirements
  }

  const parts: string[] = []
  if (functionalRequirements) {
    parts.push(`【主要功能需求】\n${functionalRequirements}`)
  }
  if (nonFunctionalRequirements) {
    parts.push(`【非功能需求】\n${nonFunctionalRequirements}`)
  }
  const combinedInputText = parts.join('\n\n')

  return {
    functionalRequirements,
    nonFunctionalRequirements,
    requirementDescription,
    supplementaryNotes,
    combinedInputText,
  }
}

const AUTO_QUALITY_REPAIR_HEADING_RE = /^##\s*自动质量修复版\s*$/m

/**
 * 页面主报告只展示自动质量修复后的最终版本。
 * 后端会把修复版作为 `## 自动质量修复版` 附加在原报告后面；这里仅剥离该章节正文，
 * 保留底层完整 reportText 以兼容旧记录与后续调试。
 */
export function getFinalAnalysisReportText(reportMarkdown: string): string {
  const normalized = reportMarkdown.replace(/\r\n/g, '\n')
  const match = AUTO_QUALITY_REPAIR_HEADING_RE.exec(normalized)
  if (!match || match.index == null) return reportMarkdown

  const bodyStart = match.index + match[0].length
  return normalized.slice(bodyStart).replace(/^\s*\n/, '').trim() || reportMarkdown
}
