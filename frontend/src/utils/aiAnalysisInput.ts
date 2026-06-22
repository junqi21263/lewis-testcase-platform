export type AiAnalysisInputMode = 'upload' | 'text'

export type AiAnalysisPageStatus =
  | 'idle'
  | 'uploading'
  | 'parsing'
  | 'analyzing'
  | 'review'
  | 'approved'
  | 'error'

export type AiAnalysisFlowStepStatus = 'todo' | 'active' | 'done'

export type AiAnalysisFlowStep = {
  id: 'source' | 'parse' | 'analysis' | 'review'
  title: string
  description: string
  status: AiAnalysisFlowStepStatus
}

export function canStartAiAnalysisFromInput(input: {
  inputMode: AiAnalysisInputMode
  directText: string
  hasParsedFile: boolean
  additionalFilesParsed: boolean
}) {
  if (input.inputMode === 'text') {
    return input.directText.trim().length > 0
  }
  return input.hasParsedFile && input.additionalFilesParsed
}

export function buildDirectAnalysisText(input: {
  directText: string
  requirementDescription?: string
  requirementSupplement?: string
}) {
  const sections = [
    ['直接输入需求', input.directText],
    ['需求描述', input.requirementDescription],
    ['补充说明', input.requirementSupplement],
  ]
    .map(([label, value]) => {
      const text = String(value ?? '').trim()
      return text ? `【${label}】\n${text}` : ''
    })
    .filter(Boolean)

  return sections.join('\n\n')
}

export function getAiAnalysisFlowSteps(input: {
  inputMode: AiAnalysisInputMode
  directText: string
  hasParsedFile: boolean
  additionalFilesParsed: boolean
  pageStatus: AiAnalysisPageStatus
  hasReport: boolean
}): AiAnalysisFlowStep[] {
  const hasInput = input.inputMode === 'text'
    ? input.directText.trim().length > 0
    : input.hasParsedFile || input.pageStatus === 'uploading' || input.pageStatus === 'parsing'
  const inputReady = canStartAiAnalysisFromInput({
    inputMode: input.inputMode,
    directText: input.directText,
    hasParsedFile: input.hasParsedFile,
    additionalFilesParsed: input.additionalFilesParsed,
  })

  const sourceStatus: AiAnalysisFlowStepStatus = hasInput ? 'done' : 'active'
  const parseStatus: AiAnalysisFlowStepStatus =
    input.pageStatus === 'uploading' || input.pageStatus === 'parsing'
      ? 'active'
      : inputReady
        ? 'done'
        : hasInput
          ? 'active'
          : 'todo'
  const analysisStatus: AiAnalysisFlowStepStatus =
    input.pageStatus === 'analyzing'
      ? 'active'
      : input.hasReport || input.pageStatus === 'review' || input.pageStatus === 'approved'
        ? 'done'
        : inputReady
          ? 'active'
          : 'todo'
  const reviewStatus: AiAnalysisFlowStepStatus =
    input.pageStatus === 'review'
      ? 'active'
      : input.pageStatus === 'approved'
        ? 'done'
        : 'todo'

  return [
    {
      id: 'source',
      title: '选择输入来源',
      description: input.inputMode === 'text' ? '粘贴需求文本' : '上传 PDF/图片/文档',
      status: sourceStatus,
    },
    {
      id: 'parse',
      title: '解析确认',
      description: input.inputMode === 'text' ? '检查文本与补充说明' : '等待解析并可编辑文本',
      status: parseStatus,
    },
    {
      id: 'analysis',
      title: '开始分析',
      description: '调用模型生成结构化报告',
      status: analysisStatus,
    },
    {
      id: 'review',
      title: '审阅与生成',
      description: '修订、通过并生成用例',
      status: reviewStatus,
    },
  ]
}
