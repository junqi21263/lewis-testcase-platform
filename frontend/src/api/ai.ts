import { request, streamRequest } from '@/utils/request'
import type { AIModel, AIGenerateParams, TestCase } from '@/types'

export interface GenerateTestCasesPayload extends AIGenerateParams {
  sourceType: 'file' | 'text' | 'url'
  fileId?: string
  text?: string
  url?: string
  templateId?: string
  customPrompt?: string
  userNotes?: string
  outputLanguage?: string
  generationOptions?: unknown
  modelConfigId?: string
}

export interface GenerateResult {
  recordId: string
  cases: TestCase[]
  tokensUsed: number
  duration: number
  qualityScore?: number | null
  qualitySuggestions?: string | null
}

export const aiApi = {
  /** 获取可用模型列表 */
  getModels: () =>
    request.get<AIModel[]>('/ai/models'),

  /** 非流式生成（小量请求） */
  generateTestCases: (payload: GenerateTestCasesPayload) =>
    request.post<GenerateResult>('/ai/generate', payload),

  /** 流式生成（SSE），大量内容时使用 */
  generateStream: (
    payload: GenerateTestCasesPayload,
    onChunk: (chunk: string) => void,
    onDone?: (meta: { recordId?: string; quality?: unknown }) => void,
    onError?: (error: Error) => void,
    signal?: AbortSignal,
  ) => {
    return streamRequest(
      '/ai/generate/stream',
      payload,
      (jsonStr) => {
        try {
          const obj = JSON.parse(jsonStr) as any
          if (obj?.t) onChunk(String(obj.t))
          if (obj?.done) onDone?.({ recordId: obj.recordId, quality: obj.quality })
          if (obj?.error) throw new Error(String(obj.error))
        } catch {
          // 兼容后端直接输出纯文本片段
          onChunk(jsonStr)
        }
      },
      () => onDone?.({}),
      onError,
      signal,
    )
  },
}
