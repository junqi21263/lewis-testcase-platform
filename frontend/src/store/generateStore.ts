import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { TestCase, AIGenerateParams, UploadedFile, GenerationOptions } from '@/types'
import { loadGenPrefs } from '@/utils/genPrefs'

type GenerateStep = 'upload' | 'prompt' | 'generating' | 'result'
type SourceType = 'file' | 'text' | 'url'

const defaultGenerationOptions: GenerationOptions = {
  testType: 'FUNCTIONAL',
  granularity: 'DETAILED',
  priorityPreset: 'MIXED',
  priorityRule: '关键路径与资金类 P0–P1，常用功能 P2，长尾与体验类 P3–P4',
  sceneNormal: 40,
  sceneAbnormal: 30,
  sceneBoundary: 30,
}

interface GenerateState {
  currentStep: GenerateStep
  setStep: (step: GenerateStep) => void

  sourceType: SourceType
  setSourceType: (type: SourceType) => void

  uploadedFile: UploadedFile | null
  setUploadedFile: (file: UploadedFile | null) => void

  inputText: string
  setInputText: (text: string) => void

  inputUrl: string
  setInputUrl: (url: string) => void

  selectedTemplateId: string | null
  customPrompt: string
  userNotes: string
  setSelectedTemplateId: (id: string | null) => void
  setCustomPrompt: (prompt: string) => void
  setUserNotes: (notes: string) => void

  generationOptions: GenerationOptions
  setGenerationOptions: (partial: Partial<GenerationOptions>) => void

  aiParams: AIGenerateParams
  setAiParams: (params: Partial<AIGenerateParams>) => void

  generatedCases: TestCase[]
  lastRecordId: string | null
  qualityScore: number | null
  qualitySuggestions: string | null

  isGenerating: boolean
  streamContent: string
  setGeneratedCases: (cases: TestCase[]) => void
  setIsGenerating: (v: boolean) => void
  appendStreamContent: (chunk: string) => void
  clearStreamContent: () => void
  setQualityMeta: (score: number | null, suggestions: string | null) => void
  setLastRecordId: (id: string | null) => void

  updateCaseLocal: (id: string, patch: Partial<TestCase>) => void

  reset: () => void
}

function buildBaseAiParams(): AIGenerateParams {
  const prefs = loadGenPrefs()
  return {
    temperature: prefs.defaultTemperature,
    maxTokens: prefs.defaultMaxTokens,
    stream: true,
  }
}

const buildInitial = (): Omit<
  GenerateState,
  | 'setStep'
  | 'setSourceType'
  | 'setUploadedFile'
  | 'setInputText'
  | 'setInputUrl'
  | 'setSelectedTemplateId'
  | 'setCustomPrompt'
  | 'setUserNotes'
  | 'setGenerationOptions'
  | 'setAiParams'
  | 'setGeneratedCases'
  | 'setIsGenerating'
  | 'appendStreamContent'
  | 'clearStreamContent'
  | 'setQualityMeta'
  | 'setLastRecordId'
  | 'updateCaseLocal'
  | 'reset'
> => ({
  currentStep: 'upload',
  sourceType: 'file',
  uploadedFile: null,
  inputText: '',
  inputUrl: '',
  selectedTemplateId: null,
  customPrompt: '',
  userNotes: '',
  generationOptions: { ...defaultGenerationOptions },
  aiParams: { ...buildBaseAiParams() },
  generatedCases: [],
  lastRecordId: null,
  qualityScore: null,
  qualitySuggestions: null,
  isGenerating: false,
  streamContent: '',
})

export const useGenerateStore = create<GenerateState>()(
  persist(
    (set) => ({
      ...buildInitial(),

      setStep: (step) => set({ currentStep: step }),
      setSourceType: (type) => set({ sourceType: type }),
      setUploadedFile: (file) => set({ uploadedFile: file }),
      setInputText: (text) => set({ inputText: text }),
      setInputUrl: (url) => set({ inputUrl: url }),
      setSelectedTemplateId: (id) => set({ selectedTemplateId: id }),
      setCustomPrompt: (prompt) => set({ customPrompt: prompt }),
      setUserNotes: (notes) => set({ userNotes: notes }),
      setGenerationOptions: (partial) =>
        set((state) => ({
          generationOptions: { ...state.generationOptions, ...partial },
        })),
      setAiParams: (params) =>
        set((state) => ({ aiParams: { ...state.aiParams, ...params } })),

      setGeneratedCases: (cases) => set({ generatedCases: cases }),
      setIsGenerating: (v) => set({ isGenerating: v }),
      appendStreamContent: (chunk) =>
        set((state) => ({ streamContent: state.streamContent + chunk })),
      clearStreamContent: () => set({ streamContent: '' }),
      setQualityMeta: (score, suggestions) =>
        set({ qualityScore: score, qualitySuggestions: suggestions }),
      setLastRecordId: (id) => set({ lastRecordId: id }),

      updateCaseLocal: (id, patch) =>
        set((state) => ({
          generatedCases: state.generatedCases.map((c) =>
            c.id === id ? { ...c, ...patch } : c,
          ),
        })),

      reset: () =>
        set({
          ...buildInitial(),
        }),
    }),
    {
      name: 'generate-session-v1',
      storage: createJSONStorage(() => localStorage),
      merge: (persisted, current) => {
        const p = persisted as Partial<GenerateState> | undefined
        return {
          ...current,
          ...p,
          generationOptions: {
            ...defaultGenerationOptions,
            ...(p?.generationOptions ?? {}),
          },
          aiParams: { ...buildBaseAiParams(), ...(p?.aiParams ?? {}) },
        }
      },
      partialize: (s) => ({
        currentStep: s.currentStep,
        sourceType: s.sourceType,
        inputText: s.inputText,
        inputUrl: s.inputUrl,
        customPrompt: s.customPrompt,
        userNotes: s.userNotes,
        selectedTemplateId: s.selectedTemplateId,
        generationOptions: s.generationOptions,
        aiParams: s.aiParams,
        generatedCases: s.generatedCases,
        lastRecordId: s.lastRecordId,
        qualityScore: s.qualityScore,
        qualitySuggestions: s.qualitySuggestions,
      }),
    },
  ),
)

export { defaultGenerationOptions }
