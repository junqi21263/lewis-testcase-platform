import { create } from 'zustand'
import type { TestCase, AIGenerateParams, UploadedFile } from '@/types'

type GenerateStep = 'upload' | 'prompt' | 'generating' | 'result'
type SourceType = 'file' | 'text' | 'url'

interface GenerateState {
  // 步骤控制
  currentStep: GenerateStep
  setStep: (step: GenerateStep) => void

  // 输入来源
  sourceType: SourceType
  setSourceType: (type: SourceType) => void

  // 文件上传
  uploadedFile: UploadedFile | null
  setUploadedFile: (file: UploadedFile | null) => void

  // 文本输入
  inputText: string
  setInputText: (text: string) => void

  // 提示词
  selectedTemplateId: string | null
  customPrompt: string
  setSelectedTemplateId: (id: string | null) => void
  setCustomPrompt: (prompt: string) => void

  // AI 参数
  aiParams: AIGenerateParams
  setAiParams: (params: Partial<AIGenerateParams>) => void

  // 生成结果
  generatedCases: TestCase[]
  isGenerating: boolean
  streamContent: string
  setGeneratedCases: (cases: TestCase[]) => void
  setIsGenerating: (v: boolean) => void
  appendStreamContent: (chunk: string) => void
  clearStreamContent: () => void

  // 重置
  reset: () => void
}

const initialAiParams: AIGenerateParams = {
  temperature: 0.7,
  maxTokens: 4096,
  stream: true,
}

export const useGenerateStore = create<GenerateState>((set) => ({
  currentStep: 'upload',
  setStep: (step) => set({ currentStep: step }),

  sourceType: 'file',
  setSourceType: (type) => set({ sourceType: type }),

  uploadedFile: null,
  setUploadedFile: (file) => set({ uploadedFile: file }),

  inputText: '',
  setInputText: (text) => set({ inputText: text }),

  selectedTemplateId: null,
  customPrompt: '',
  setSelectedTemplateId: (id) => set({ selectedTemplateId: id }),
  setCustomPrompt: (prompt) => set({ customPrompt: prompt }),

  aiParams: initialAiParams,
  setAiParams: (params) =>
    set((state) => ({ aiParams: { ...state.aiParams, ...params } })),

  generatedCases: [],
  isGenerating: false,
  streamContent: '',
  setGeneratedCases: (cases) => set({ generatedCases: cases }),
  setIsGenerating: (v) => set({ isGenerating: v }),
  appendStreamContent: (chunk) =>
    set((state) => ({ streamContent: state.streamContent + chunk })),
  clearStreamContent: () => set({ streamContent: '' }),

  reset: () =>
    set({
      currentStep: 'upload',
      sourceType: 'file',
      uploadedFile: null,
      inputText: '',
      selectedTemplateId: null,
      customPrompt: '',
      aiParams: initialAiParams,
      generatedCases: [],
      isGenerating: false,
      streamContent: '',
    }),
}))
