export type AiAnalysisInputMode = 'upload' | 'text' | 'history'

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
  id: 'source' | 'quality' | 'analysis' | 'review' | 'generate'
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
  if (input.inputMode === 'history') {
    return false
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
    : input.inputMode === 'history'
      ? false
      : input.hasParsedFile || input.pageStatus === 'uploading' || input.pageStatus === 'parsing'
  const inputReady = canStartAiAnalysisFromInput({
    inputMode: input.inputMode,
    directText: input.directText,
    hasParsedFile: input.hasParsedFile,
    additionalFilesParsed: input.additionalFilesParsed,
  })

  const sourceStatus: AiAnalysisFlowStepStatus = hasInput ? 'done' : 'active'
  const qualityStatus: AiAnalysisFlowStepStatus =
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
  const generateStatus: AiAnalysisFlowStepStatus =
    input.pageStatus === 'approved'
      ? 'active'
      : 'todo'

  return [
    {
      id: 'source',
      title: '选择输入',
      description:
        input.inputMode === 'text'
          ? '粘贴需求文本'
          : input.inputMode === 'history'
            ? '从历史记录恢复'
            : '上传 PDF/图片/文档',
      status: sourceStatus,
    },
    {
      id: 'quality',
      title: '输入质检',
      description: input.inputMode === 'text' ? '检查文本与补充说明' : '解析质量与上下文确认',
      status: qualityStatus,
    },
    {
      id: 'analysis',
      title: 'AI 分析运行',
      description: '流式报告与耗时指标',
      status: analysisStatus,
    },
    {
      id: 'review',
      title: '结构化审阅',
      description: '问题确认与一键修订',
      status: reviewStatus,
    },
    {
      id: 'generate',
      title: '生成用例',
      description: '携带 REQ/TP 进入用例生成',
      status: generateStatus,
    },
  ]
}
