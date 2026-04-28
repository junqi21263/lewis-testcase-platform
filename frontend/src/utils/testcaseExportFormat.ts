import type { TestCase, TestStep } from '@/types'

/**
 * 与后端 `TestcasesService` Excel 导出列顺序、语义一致（前端降级 CSV/文件名用）
 * @see backend/src/modules/testcases/testcases.service.ts
 */
export const TESTCASE_EXPORT_COLUMNS_CN = [
  '用例名称',
  '所属模块',
  '标签',
  '前置条件',
  '步骤描述',
  '预期结果',
  '编辑模式',
  '备注',
  '用例等级',
] as const

/** 与后端 Excel 文件名一致：`YYYYMMDD_HHmm` */
export function exportFilenameTimestamp(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`
}

export function formatStepsForExport(steps: TestStep[] | undefined): string {
  if (!steps?.length) return ''
  return steps
    .map((s) => {
      const exp = s.expected?.trim()
      return exp ? `${s.order}. ${s.action}（期望：${exp}）` : `${s.order}. ${s.action}`
    })
    .join('\n')
}

export function caseStatusToEditModeLabel(status: string): string {
  const m: Record<string, string> = {
    DRAFT: '草稿',
    REVIEWING: '评审中',
    APPROVED: '已通过',
    ARCHIVED: '已归档',
  }
  return m[status] ?? status
}

export function testcaseDelimitedValues(c: TestCase, moduleLabel: string): string[] {
  return [
    c.title ?? '',
    moduleLabel,
    (c.tags ?? []).filter(Boolean).join(', '),
    c.precondition ?? '',
    formatStepsForExport(c.steps),
    c.expectedResult ?? '',
    caseStatusToEditModeLabel(String(c.status ?? '')),
    c.description ?? '',
    String(c.priority ?? ''),
  ]
}
