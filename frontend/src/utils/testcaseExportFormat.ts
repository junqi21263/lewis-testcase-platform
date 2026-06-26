import type { TestCase, TestStep } from '@/types'
import { extractModuleFromTags } from '@/utils/parseLooseAiOutput'

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

/** 与后端 Excel 文件名一致：`YYYYMMDD_HHmm`，固定按 Asia/Shanghai 输出，避免 CI/容器 UTC 漂移。 */
export function exportFilenameTimestamp(d = new Date()): string {
  const parts = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d)
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? '00'
  return `${value('year')}${value('month')}${value('day')}_${value('hour')}${value('minute')}`
}

export function formatStepsForExport(steps: TestStep[] | undefined): string {
  if (!steps?.length) return ''
  return steps
    .map((s) => {
      const exp = s.expected?.trim()
      return exp ? `[${s.order}] ${s.action}（期望：${exp}）` : `[${s.order}] ${s.action}`
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

/** 导出用「所属模块」：优先用例标签中的 模块:xxx，否则用用例集 projectName */
export function testcaseModuleLabel(c: TestCase, suiteFallback: string): string {
  return extractModuleFromTags(c.tags) || suiteFallback
}

function tagsForExportCell(tags: string[] | undefined): string {
  if (!tags?.length) return ''
  return tags.filter((t) => t && !t.startsWith('模块:')).join(', ')
}

export function testcaseDelimitedValues(c: TestCase, moduleLabel: string): string[] {
  const mod = testcaseModuleLabel(c, moduleLabel)
  return [
    c.title ?? '',
    mod,
    tagsForExportCell(c.tags),
    c.precondition ?? '',
    formatStepsForExport(c.steps),
    c.expectedResult ?? '',
    caseStatusToEditModeLabel(String(c.status ?? '')),
    c.description ?? '',
    String(c.priority ?? ''),
  ]
}
