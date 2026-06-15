import { Injectable } from '@nestjs/common'

export type FlowchartNodeType = 'start' | 'process' | 'decision' | 'end'
export type FlowchartBranchType = 'success' | 'exception' | 'neutral'

export type FlowchartNode = {
  id: string
  label: string
  type: FlowchartNodeType
}

export type FlowchartBranch = {
  from: string
  condition: string
  to: string
  type: FlowchartBranchType
}

export type FlowchartContext = {
  kind: 'flowchart'
  confidence: number
  nodes: FlowchartNode[]
  branches: FlowchartBranch[]
  mainPath: string[]
  exceptionPaths: string[][]
}

type Edge = {
  from: string
  to: string
  condition: string
  type: FlowchartBranchType
}

@Injectable()
export class PdfFlowchartParseService {
  private readonly maxNodes = 80

  parseFromText(text: string): FlowchartContext | null {
    const normalized = this.normalizeText(text)
    if (!normalized) return null

    const edges = this.extractEdges(normalized)
    const nodes = this.extractNodes(edges)
    const confidence = this.score(normalized, edges, nodes)
    if (confidence < 0.45 || nodes.length < 3 || edges.length < 2) return null

    const mainPath = this.buildMainPath(edges)
    const exceptionPaths = this.buildExceptionPaths(edges, mainPath)

    return {
      kind: 'flowchart',
      confidence,
      nodes,
      branches: edges
        .filter((edge) => edge.condition || edge.type !== 'neutral')
        .map((edge) => ({
          from: edge.from,
          condition: edge.condition || '默认',
          to: edge.to,
          type: edge.type,
        })),
      mainPath,
      exceptionPaths,
    }
  }

  toPromptContext(context: FlowchartContext | null | undefined): string {
    if (!context) return ''
    const nodeLines = context.nodes
      .slice(0, 30)
      .map((node, index) => `${index + 1}. ${node.label}${node.type === 'decision' ? '（判断）' : ''}`)
      .join('\n')
    const branchLines = context.branches
      .slice(0, 30)
      .map((branch) => `- ${branch.from} -- ${branch.condition} --> ${branch.to}${branch.type === 'exception' ? '（异常）' : ''}`)
      .join('\n')
    const exceptionLines = context.exceptionPaths
      .slice(0, 12)
      .map((path) => `- ${path.join(' -> ')}`)
      .join('\n')

    return [
      '## 流程图结构化摘要',
      `- 置信度：${Math.round(context.confidence * 100)}%`,
      `- 主流程：${context.mainPath.join(' -> ')}`,
      branchLines ? `- 异常/分支：\n${branchLines}` : '- 异常/分支：未识别到显式分支',
      exceptionLines ? `- 异常路径：\n${exceptionLines}` : '',
      nodeLines ? `- 流程节点：\n${nodeLines}` : '',
    ]
      .filter(Boolean)
      .join('\n')
      .slice(0, 4000)
  }

  private normalizeText(text: string): string {
    return (text || '')
      .replace(/\r/g, '\n')
      .replace(/[ \t]+/g, ' ')
      .replace(/[→➜➝⇒]/g, '->')
      .replace(/[—–]/g, '-')
      .trim()
  }

  private extractEdges(text: string): Edge[] {
    const edges: Edge[] = []
    const nodeLabelMap = this.buildNodeLabelMap(text)
    const lines = text
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)

    for (const line of lines) {
      edges.push(...this.extractMermaidEdges(line, nodeLabelMap))
      edges.push(...this.extractArrowChainEdges(line, nodeLabelMap))
    }

    return this.dedupeEdges(edges).slice(0, this.maxNodes * 2)
  }

  private buildNodeLabelMap(text: string): Map<string, string> {
    const map = new Map<string, string>()
    const re = /([A-Za-z0-9_]+)\s*[\[{(（]([^\]\})）]+)[\]\})）]/g
    let match: RegExpExecArray | null
    while ((match = re.exec(text)) !== null) {
      const id = match[1].trim()
      const label = this.cleanNodeLabel(match[2])
      if (id && label) map.set(id, label)
    }
    return map
  }

  private extractMermaidEdges(line: string, nodeLabelMap: Map<string, string>): Edge[] {
    const edges: Edge[] = []
    const re = /(.+?)\s*(?:--\s*([^->]+?)\s*-->|-->|->)\s*(.+)$/g
    let match: RegExpExecArray | null
    while ((match = re.exec(line)) !== null) {
      const from = this.resolveNodeLabel(match[1], nodeLabelMap)
      const condition = this.cleanCondition(match[2] || '')
      const to = this.resolveNodeLabel(match[3], nodeLabelMap)
      if (from && to && from !== to) {
        edges.push({ from, to, condition, type: this.classifyBranch(condition, to) })
      }
    }
    return edges
  }

  private extractArrowChainEdges(line: string, nodeLabelMap: Map<string, string>): Edge[] {
    if (line.includes('-->') || /--\s*[^-]+?\s*-->/.test(line)) return []
    if (!/(?:->|=>|→|到|至|进入|跳转)/.test(line)) return []
    const normalized = line.replace(/=>/g, '->').replace(/(?:到|至|进入|跳转)/g, '->')
    if (!normalized.includes('->')) return []

    const parts = normalized
      .split('->')
      .map((part) => this.resolveNodeLabel(part, nodeLabelMap))
      .filter((part) => part.length > 0)
      .slice(0, this.maxNodes)

    const edges: Edge[] = []
    for (let i = 0; i < parts.length - 1; i++) {
      edges.push({
        from: parts[i],
        to: parts[i + 1],
        condition: '',
        type: this.classifyBranch('', parts[i + 1]),
      })
    }
    return edges
  }

  private extractNodes(edges: Edge[]): FlowchartNode[] {
    const seen = new Map<string, FlowchartNode>()
    for (const edge of edges) {
      for (const label of [edge.from, edge.to]) {
        if (!seen.has(label)) {
          seen.set(label, {
            id: this.nodeId(label, seen.size + 1),
            label,
            type: this.classifyNode(label),
          })
        }
      }
    }
    return Array.from(seen.values()).slice(0, this.maxNodes)
  }

  private buildMainPath(edges: Edge[]): string[] {
    if (edges.length === 0) return []
    const incoming = new Set(edges.map((edge) => edge.to))
    let current = edges.find((edge) => !incoming.has(edge.from))?.from ?? edges[0].from
    const path = [current]
    const visited = new Set<string>([current])

    for (let i = 0; i < this.maxNodes; i++) {
      const next = edges.find((edge) => edge.from === current && edge.type !== 'exception') ?? edges.find((edge) => edge.from === current)
      if (!next || visited.has(next.to)) break
      path.push(next.to)
      visited.add(next.to)
      current = next.to
    }
    return path
  }

  private buildExceptionPaths(edges: Edge[], mainPath: string[]): string[][] {
    const mainPathNodes = new Set(mainPath)
    return edges
      .filter((edge) => edge.type === 'exception')
      .map((edge) => {
        const path = [edge.from, edge.to]
        const visited = new Set(path)
        let current = edge.to
        for (let i = 0; i < 6; i++) {
          const next = edges.find((candidate) => candidate.from === current && !visited.has(candidate.to))
          if (!next) break
          if (mainPathNodes.has(next.to)) break
          path.push(next.to)
          visited.add(next.to)
          current = next.to
        }
        return path
      })
      .slice(0, 20)
  }

  private score(text: string, edges: Edge[], nodes: FlowchartNode[]): number {
    let score = 0
    if (/流程图|flowchart|mermaid/i.test(text)) score += 0.2
    if (edges.length >= 2) score += 0.25
    if (nodes.some((node) => node.type === 'decision')) score += 0.2
    if (edges.some((edge) => edge.condition)) score += 0.15
    if (/(->|-->|→|到|进入|跳转)/.test(text)) score += 0.2
    return Math.min(1, score)
  }

  private classifyNode(label: string): FlowchartNodeType {
    if (/开始|打开|入口|start/i.test(label)) return 'start'
    if (/结束|完成|成功|进入首页|end/i.test(label)) return 'end'
    if (/是否|判断|校验|检查|\?|？/.test(label)) return 'decision'
    return 'process'
  }

  private classifyBranch(condition: string, to: string): FlowchartBranchType {
    if (condition) {
      if (/否|不通过|失败|错误|异常|驳回|拒绝|超时|无权限|取消/.test(condition)) return 'exception'
      if (/是|通过|成功|正确|完成|允许/.test(condition)) return 'success'
    }
    if (/失败|错误|异常|驳回|拒绝|超时|无权限|取消/.test(to)) return 'exception'
    if (/成功|完成/.test(to)) return 'success'
    return 'neutral'
  }

  private cleanCondition(input: string): string {
    return this.cleanNodeLabel(input).replace(/^(条件|分支)[:：]/, '').trim()
  }

  private resolveNodeLabel(input: string, nodeLabelMap: Map<string, string>): string {
    const cleaned = this.cleanNodeLabel(input)
    return nodeLabelMap.get(cleaned) ?? cleaned
  }

  private cleanNodeLabel(input: string): string {
    return String(input || '')
      .replace(/^[A-Za-z0-9_]+\s*(?=[\[{(（])/, '')
      .replace(/^[A-Za-z0-9_]+[:：]\s*/, '')
      .replace(/[\[\]{}()（）]/g, '')
      .replace(/^[-\s]+|[-\s]+$/g, '')
      .replace(/\s+/g, ' ')
      .slice(0, 120)
      .trim()
  }

  private dedupeEdges(edges: Edge[]): Edge[] {
    const seen = new Set<string>()
    const result: Edge[] = []
    for (const edge of edges) {
      const key = `${edge.from}\u0000${edge.condition}\u0000${edge.to}`
      if (seen.has(key)) continue
      seen.add(key)
      result.push(edge)
    }
    return result
  }

  private nodeId(label: string, index: number): string {
    const normalized = label
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
      .replace(/^-+|-+$/g, '')
    return normalized || `node-${index}`
  }
}
