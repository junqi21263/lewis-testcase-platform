import { request, streamRequest, type StreamDoneMeta } from '@/utils/request'
import type { AIModel, AIGenerateParams, TestCase } from '@/types'

export interface GenerateTestCasesPayload extends AIGenerateParams {
  sourceType: 'file' | 'text' | 'url'
  fileId?: string
  text?: string
  url?: string
  templateId?: string
  customPrompt?: string
}

export interface GenerateResult {
  recordId: string
  cases: TestCase[]
  tokensUsed: number
  duration: number
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
    onDone?: (meta?: StreamDoneMeta) => void,
    onError?: (error: Error) => void,
  ) => {
    return streamRequest('/ai/generate/stream', payload, onChunk, onDone, onError)
  },
}
