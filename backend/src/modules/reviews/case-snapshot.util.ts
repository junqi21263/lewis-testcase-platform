import type { TestCase, TestCasePriority, TestCaseType } from '@prisma/client'

export type CaseSnapshot = {
  title: string
  priority: string
  type: string
  tags: string[]
  precondition: string
  steps: { order: number; action: string; expected?: string }[]
  expectedResults: string[]
  expectedResult: string
  remarks?: string
  requirementIds?: string[]
  testPathIds?: string[]
  automationReadiness?: unknown
}

export function splitExpectedResults(expectedResult: string): string[] {
  const text = (expectedResult || '').trim()
  if (!text) return ['']
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
  const numbered: string[] = []
  let hasNumber = false
  for (const line of lines) {
    const m = line.match(/^\[(\d+)\]\s*(.*)$/)
    if (m) {
      hasNumber = true
      const idx = Math.max(0, parseInt(m[1], 10) - 1)
      while (numbered.length <= idx) numbered.push('')
      numbered[idx] = m[2] ?? ''
    } else if (!hasNumber) {
      numbered.push(line)
    }
  }
  return numbered.length ? numbered : ['']
}

export function mergeExpectedResults(parts: string[]): string {
  const cleaned = parts.map((p) => p.trim()).filter((p, i, arr) => p.length > 0 || arr.length === 1)
  if (!cleaned.length) return '（无）'
  return cleaned.map((p, i) => `[${i + 1}] ${p}`).join('\n')
}

export function buildSnapshotFromCase(c: TestCase, remarks = ''): CaseSnapshot {
  const steps = Array.isArray(c.steps)
    ? (c.steps as { order?: number; action?: string; expected?: string }[]).map((s, i) => ({
        order: typeof s.order === 'number' ? s.order : i + 1,
        action: s.action != null ? String(s.action) : '',
        expected: s.expected != null ? String(s.expected) : undefined,
      }))
    : []
  return {
    title: c.title,
    priority: c.priority,
    type: c.type,
    tags: Array.isArray(c.tags) ? c.tags.map(String) : [],
    precondition: c.precondition ?? '',
    steps,
    expectedResults: splitExpectedResults(c.expectedResult),
    expectedResult: c.expectedResult,
    remarks,
    requirementIds: Array.isArray((c as any).requirementIds) ? (c as any).requirementIds.map(String) : [],
    testPathIds: Array.isArray((c as any).testPathIds) ? (c as any).testPathIds.map(String) : [],
    automationReadiness: (c as any).automationReadiness ?? null,
  }
}

export function snapshotToCaseUpdate(snapshot: CaseSnapshot) {
  const steps = snapshot.steps.map((s, i) => ({
    order: s.order ?? i + 1,
    action: s.action ?? '',
    expected: s.expected,
  }))
  const expectedResult = mergeExpectedResults(snapshot.expectedResults ?? [])
  return {
    title: snapshot.title.trim().slice(0, 500),
    priority: snapshot.priority as TestCasePriority,
    type: snapshot.type as TestCaseType,
    tags: snapshot.tags ?? [],
    precondition: snapshot.precondition?.trim() || null,
    steps,
    expectedResult,
    description: snapshot.remarks?.trim() || null,
    requirementIds: snapshot.requirementIds ?? [],
    testPathIds: snapshot.testPathIds ?? [],
    automationReadiness: (snapshot.automationReadiness ?? null) as any,
  }
}
