import type { AIModelAdmin, RuntimeHints } from '@/api/settings'

export type ProviderPreset = {
  id: string
  label: string
  provider: string
  modelId: string
  baseUrl: string
  maxTokens: number
  temperature: number
  supportsVision: boolean
}

export type SettingsModelFilter = 'all' | 'active' | 'default' | 'vision' | 'failed'

export const SETTINGS_PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: 'openai-compatible',
    label: 'OpenAI Compatible',
    provider: 'OpenAI',
    modelId: 'gpt-4o',
    baseUrl: 'https://api.openai.com/v1',
    maxTokens: 32768,
    temperature: 0.7,
    supportsVision: false,
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    provider: 'DeepSeek',
    modelId: 'deepseek-chat',
    baseUrl: 'https://api.deepseek.com/v1',
    maxTokens: 32768,
    temperature: 0.7,
    supportsVision: false,
  },
  {
    id: 'volcengine-ark',
    label: 'Volcengine Ark',
    provider: 'Ark',
    modelId: 'doubao-seed-1-6',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    maxTokens: 32768,
    temperature: 0.7,
    supportsVision: true,
  },
  {
    id: 'zhipu',
    label: 'Zhipu',
    provider: 'Zhipu',
    modelId: 'glm-4-plus',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    maxTokens: 32768,
    temperature: 0.7,
    supportsVision: true,
  },
  {
    id: 'hunyuan',
    label: 'Hunyuan',
    provider: 'Hunyuan',
    modelId: 'hunyuan-turbos-latest',
    baseUrl: 'https://api.hunyuan.cloud.tencent.com/v1',
    maxTokens: 32768,
    temperature: 0.7,
    supportsVision: true,
  },
  {
    id: 'custom-proxy',
    label: 'Custom Proxy',
    provider: 'Custom',
    modelId: 'model-id',
    baseUrl: 'https://your-proxy.example.com/v1',
    maxTokens: 32768,
    temperature: 0.7,
    supportsVision: false,
  },
]

export function getProviderPreset(labelOrId: string): ProviderPreset | undefined {
  const key = labelOrId.trim().toLowerCase()
  return SETTINGS_PROVIDER_PRESETS.find(
    (p) => p.id.toLowerCase() === key || p.label.toLowerCase() === key || p.provider.toLowerCase() === key,
  )
}

export function getModelIssueTags(model: AIModelAdmin): string[] {
  const issues: string[] = []
  if (!model.hasApiKey) issues.push('缺少 API Key')
  if (!model.isActive) issues.push('已停用')
  if (model.lastTestOk === false) issues.push('最近测试失败')
  if (model.useForDocumentVisionParse && !model.supportsVision) issues.push('视觉解析模型未标记视觉能力')
  return issues
}

export function filterSettingsModels(models: AIModelAdmin[], filter: SettingsModelFilter): AIModelAdmin[] {
  if (filter === 'active') return models.filter((m) => m.isActive)
  if (filter === 'default') return models.filter((m) => m.isDefault)
  if (filter === 'vision') return models.filter((m) => m.supportsVision || m.useForDocumentVisionParse)
  if (filter === 'failed') return models.filter((m) => getModelIssueTags(m).some((tag) => tag.includes('失败')))
  return models
}

export function buildSettingsOverview(runtime: RuntimeHints | null, models: AIModelAdmin[]) {
  const defaultModel = models.find((m) => m.isDefault)
  const visionModel = models.find((m) => m.useForDocumentVisionParse)
  const pendingQueueCount = (runtime?.queues ?? []).reduce((sum, queue) => sum + queue.pending, 0)
  const failedModelCount = models.filter((m) => m.lastTestOk === false).length
  return {
    redisLabel: runtime?.redis?.ready
      ? 'Redis 已连接'
      : runtime?.redis?.urlConfigured
        ? 'Redis 未连接'
        : 'Redis 未配置',
    streamRecoveryLabel: runtime?.streamRecovery?.enabled ? '流式恢复已启用' : '流式恢复未启用',
    defaultModelName: defaultModel?.name ?? '未设置默认模型',
    visionModelName: visionModel?.name ?? '未设置视觉解析模型',
    enabledModelCount: models.filter((m) => m.isActive).length,
    failedModelCount,
    pendingQueueCount,
    uploadLimitLabel: runtime ? `${runtime.maxUploadMb} MB` : '-',
    workerLabel: runtime?.workers?.fileParseEnabled
      ? `文件解析 Worker 已启用，并发 ${runtime.workers.fileParseMaxConcurrent}`
      : '文件解析 Worker 未启用',
  }
}
