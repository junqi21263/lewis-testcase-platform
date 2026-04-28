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
  /** 输入压缩、输出达 Token 上限等提示 */
  warnings?: string[]
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

  /** 管理用途：测试模型连通性（需要管理员权限） */
  testModel: (payload: TestModelPayload) =>
    request.post<TestModelResult>('/ai/test', payload),
}
