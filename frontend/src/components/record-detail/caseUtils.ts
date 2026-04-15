import type { TestCase, TestStep } from '@/types'

/** 与详情页「保存用例」字段一致，用于离开页面前的脏检测 */
export function casesDataSnapshot(cases: TestCase[]): string {
  return JSON.stringify(
    cases.map((c) => ({
      id: c.id,
      title: c.title,
      precondition: c.precondition ?? '',
      expectedResult: c.expectedResult,
      priority: c.priority,
      type: c.type,
      tags: c.tags,
      steps: c.steps.map((s) => ({
        order: s.order,
        action: s.action,
        expected: s.expected ?? '',
      })),
    })),
  )
}

/** 后端 steps 可能为 JSON 数组或历史字符串 */
export function normalizeSteps(raw: unknown): TestStep[] {
  if (raw == null) return [{ order: 1, action: '', expected: '' }]
  if (Array.isArray(raw)) {
    return (raw as TestStep[]).map((s, i) => ({
      order: typeof s.order === 'number' ? s.order : i + 1,
      action: String(s.action ?? ''),
      expected: s.expected != null ? String(s.expected) : '',
    }))
  }
  if (typeof raw === 'string') {
    try {
      const p = JSON.parse(raw) as unknown
      if (Array.isArray(p)) return normalizeSteps(p)
    } catch {
      /* 非 JSON，当作单步 */
    }
    return [{ order: 1, action: raw, expected: '' }]
  }
  return [{ order: 1, action: '', expected: '' }]
}

export function stepsToLines(steps: TestStep[]): string {
  return steps.map((s) => `${s.order}. ${s.action}`).join('\n')
}
