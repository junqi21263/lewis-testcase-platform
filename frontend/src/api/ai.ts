import { request, streamRequest, type StreamDoneMeta } from '@/utils/request'
import type { AIModel, AIGenerateParams, AnalysisCrossReview, AnalysisStructuredResult, TestCase, QualityReport, ClosedLoopResult } from '@/types'

export interface GenerateTestCasesPayload extends AIGenerateParams {
  sourceType: 'file' | 'text'
  fileId?: string
  /** 与 fileId 合计 ≤5；多文件时需均为图片 */
  additionalFileIds?: string[]
  text?: string
  templateId?: string
  customPrompt?: string
  forceConfiguredModel?: boolean
}

export interface GenerateResult {
  recordId: string
  cases: TestCase[]
  tokensUsed: number
  duration: number
  /** 输入压缩、输出达 Token 上限等提示 */
  warnings?: string[]
  qualityReport?: QualityReport
  autoRepair?: ClosedLoopResult
}

export type TestModelPayload = {
  modelConfigId?: string
  prompt?: string
}

export type TestModelResult = {
  ok: boolean
  modelId: string
  modelName: string
  latencyMs: number
  sample: string
}

export type AnalysisReportVersion = {
  id: string
  recordId: string
  versionNumber: number
  sourceType: 'analysis' | 'revision' | 'cross_review'
  markdown: string
  structured: AnalysisStructuredResult
  modelId: string
  modelName: string
  revisionNote?: string | null
  createdAt: string
}

export type AnalysisReportVersionDiffField = {
  field: string
  label: string
  before: string
  after: string
  changed: boolean
}

export type CrossReviewResult = AnalysisCrossReview & {
  versionNumber?: number
}

export type AiStreamSnapshot = {
  recordId: string
  status: string
  errorMessage?: string | null
  content: string
}

export const aiApi = {
  /** 获取可用模型列表 */
  getModels: () =>
    request.get<AIModel[]>('/ai/models'),

  /** 非流式生成（小量请求） */
  generateTestCases: (payload: GenerateTestCasesPayload) =>
    request.post<GenerateResult>('/ai/generate', payload),

  /** AI 需求-用例闭环优化：生成最终推荐版 */
  runClosedLoop: (recordId: string) =>
    request.post<ClosedLoopResult>(`/ai/records/${recordId}/close-loop`, {}),

  /** 流式生成（SSE），大量内容时使用 */
  generateStream: (
    payload: GenerateTestCasesPayload,
    onChunk: (chunk: string) => void,
    onDone?: (meta?: StreamDoneMeta) => void,
    onError?: (error: Error) => void,
    signal?: AbortSignal,
  ) => {
    return streamRequest('/ai/generate/stream', payload, onChunk, onDone, onError, signal)
  },

  /** 需求分析专用流式（SSE，不走用例管线） */
  analyzeStream: (
    payload: Omit<GenerateTestCasesPayload, 'sourceType'> & {
      sourceType: 'file' | 'text'
      /** 与 fileId 合计 ≤5；多文件时需均为图片 */
      additionalFileIds?: string[]
      baseRecordId?: string
      revisionNote?: string
    },
    onChunk: (chunk: string) => void,
    onDone?: (meta?: StreamDoneMeta) => void,
    onError?: (error: Error) => void,
    signal?: AbortSignal,
  ) => {
    return streamRequest('/ai/analyze/stream', payload, onChunk, onDone, onError, signal)
  },

  /** 管理用途：测试模型连通性（需要管理员权限） */
  testModel: (payload: TestModelPayload) =>
    request.post<TestModelResult>('/ai/test', payload),

  listAnalysisVersions: (recordId: string) =>
    request.get<AnalysisReportVersion[]>(`/ai/analysis/records/${recordId}/versions`),

  diffAnalysisVersions: (
    recordId: string,
    params: { leftVersionId?: string; rightVersionId?: string } = {},
  ) =>
    request.get<AnalysisReportVersionDiffField[]>(`/ai/analysis/records/${recordId}/diff`, {
      params,
    }),

  getStreamSnapshot: (recordId: string) =>
    request.get<AiStreamSnapshot>(`/ai/streams/${recordId}/snapshot`),

  crossReviewAnalysis: (recordId: string) =>
    request.post<CrossReviewResult>(`/ai/analysis/records/${recordId}/cross-review`, {}),
}
