import type { GenerationRecord } from '@/types'

export type RecordWorkflowStepId =
  | 'parsed'
  | 'analyzed'
  | 'generated'
  | 'closed_loop'
  | 'review'
  | 'executable'

export type RecordWorkflowStepState = 'complete' | 'current' | 'pending' | 'blocked'

export type RecordWorkflowStep = {
  id: RecordWorkflowStepId
  label: string
  description: string
  state: RecordWorkflowStepState
}

export type RecordWorkflow = {
  current: RecordWorkflowStep
  steps: RecordWorkflowStep[]
  nextAction: string
}

const baseSteps: Omit<RecordWorkflowStep, 'state'>[] = [
  { id: 'parsed', label: '已解析', description: '输入内容已进入平台' },
  { id: 'analyzed', label: '已分析', description: '需求内容可用于生成' },
  { id: 'generated', label: '已生成', description: '测试用例已产出' },
  { id: 'closed_loop', label: '已闭环', description: '质量问题已自动修订' },
  { id: 'review', label: '待评审', description: '进入人工确认环节' },
  { id: 'executable', label: '可执行', description: '可交给自动化执行' },
]

const terminalBlocked = new Set(['FAILED', 'CANCELLED'])

function textReady(record: GenerationRecord): boolean {
  return Boolean(
    record.prompt?.trim() ||
      record.demandContent?.trim() ||
      record.promptTemplateSnapshot?.trim() ||
      record.documentParseRecordId ||
      record.documentParseRecord,
  )
}

function fileParsed(record: GenerationRecord): boolean {
  const st = record.file?.status?.toUpperCase()
  return Boolean(
    st === 'PARSED' ||
      st === 'SUCCESS' ||
      st === 'DONE' ||
      record.documentParseRecordId ||
      record.documentParseRecord ||
      textReady(record),
  )
}

function parsed(record: GenerationRecord): boolean {
  if (record.sourceType === 'text' || record.generationSource === 'MANUAL_INPUT') return textReady(record)
  if (record.fileId || record.file || record.sourceType === 'file' || record.generationSource === 'FILE_PARSE') {
    return fileParsed(record)
  }
  return textReady(record)
}

function closedLoopDone(record: GenerationRecord): boolean {
  const haystack = [record.notes, record.remark, ...(record.tags ?? [])].filter(Boolean).join(' ')
  return /AI\s*闭环|ai-closed-loop/i.test(haystack)
}

function generated(record: GenerationRecord): boolean {
  return record.status === 'SUCCESS' && record.caseCount > 0
}

function reviewComplete(record: GenerationRecord): boolean {
  return record.reviewStatus === 'approved' || record.reviewStatus === 'rejected'
}

function executable(record: GenerationRecord): boolean {
  return record.reviewStatus === 'approved'
}

function currentStepId(record: GenerationRecord): RecordWorkflowStepId {
  if (!parsed(record)) return 'parsed'
  if (!textReady(record)) return 'analyzed'
  if (!generated(record)) return 'generated'
  if (!closedLoopDone(record) && !record.reviewStatus) return 'generated'
  if (!closedLoopDone(record)) return 'review'
  if (!reviewComplete(record)) return 'review'
  return executable(record) ? 'executable' : 'review'
}

function nextActionFor(current: RecordWorkflowStepId, record: GenerationRecord): string {
  if (terminalBlocked.has(record.status)) return '处理失败记录或重新生成'
  if (current === 'parsed') return '等待文件解析完成或补充需求输入'
  if (current === 'analyzed') return '完善需求分析后生成用例'
  if (current === 'generated') return record.caseCount > 0 ? '运行生成最终推荐版或进入评审' : '生成测试用例'
  if (current === 'closed_loop') return '进入评审中心确认变更'
  if (current === 'review') return '完成评审，通过后进入执行'
  return '可导入自动化执行结果并回写评审'
}

export function buildRecordWorkflow(record: GenerationRecord): RecordWorkflow {
  const complete = new Set<RecordWorkflowStepId>()
  if (parsed(record)) complete.add('parsed')
  if (textReady(record)) complete.add('analyzed')
  if (generated(record)) complete.add('generated')
  if (closedLoopDone(record)) complete.add('closed_loop')
  if (reviewComplete(record)) complete.add('review')
  if (executable(record)) complete.add('executable')

  const currentId = currentStepId(record)
  const blocked = terminalBlocked.has(record.status)
  const steps = baseSteps.map((step) => {
    let state: RecordWorkflowStepState = complete.has(step.id) ? 'complete' : 'pending'
    if (step.id === currentId && state !== 'complete') state = blocked ? 'blocked' : 'current'
    if (step.id === currentId && step.id === 'executable' && complete.has(step.id)) state = 'complete'
    return { ...step, state }
  })
  const current = steps.find((step) => step.id === currentId) ?? steps[0]
  return {
    current,
    steps,
    nextAction: nextActionFor(current.id, record),
  }
}
