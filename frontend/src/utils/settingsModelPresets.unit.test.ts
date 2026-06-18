import { describe, expect, it } from 'vitest'
import type { AIModelAdmin, RuntimeHints } from '@/api/settings'
import {
  buildSettingsOverview,
  filterSettingsModels,
  getModelIssueTags,
  getProviderPreset,
} from './settingsModelPresets'

const runtime: RuntimeHints = {
  maxUploadMb: 10,
  maxFileSizeBytes: 10 * 1024 * 1024,
  throttleTtlSec: 60,
  throttleLimit: 100,
  redis: { ready: true, enabled: true, urlConfigured: true },
  queues: [
    { name: 'file-parse', pending: 0 },
    { name: 'ai-analysis', pending: 3 },
  ],
  workers: {
    fileParseEnabled: true,
    fileParseMaxConcurrent: 3,
    fileParseIntervalMs: 1500,
    fileParseTimeoutMinutes: 15,
  },
  streamRecovery: {
    enabled: true,
    snapshotEndpoint: '/api/ai/streams/:recordId/snapshot',
    maxChars: 2000000,
  },
  templateCache: { redisEnabled: true, ttlMs: 30000 },
}

const models: AIModelAdmin[] = [
  {
    id: 'm-default',
    name: '默认生成模型',
    provider: 'OpenAI',
    modelId: 'gpt-4o',
    baseUrl: 'https://api.openai.com/v1',
    maxTokens: 32768,
    temperature: 0.7,
    isDefault: true,
    isActive: true,
    supportsVision: false,
    useForDocumentVisionParse: false,
    hasApiKey: true,
    lastTestOk: true,
    lastTestAt: '2026-06-18T00:00:00.000Z',
    lastTestLatencyMs: 500,
    lastTestError: null,
    createdAt: '2026-06-18T00:00:00.000Z',
    updatedAt: '2026-06-18T00:00:00.000Z',
  },
  {
    id: 'm-vision',
    name: '视觉解析模型',
    provider: 'Ark',
    modelId: 'doubao-vision',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    maxTokens: 8192,
    temperature: 0.2,
    isDefault: false,
    isActive: true,
    supportsVision: true,
    useForDocumentVisionParse: true,
    hasApiKey: false,
    lastTestOk: false,
    lastTestAt: '2026-06-18T00:00:00.000Z',
    lastTestLatencyMs: null,
    lastTestError: '401',
    createdAt: '2026-06-18T00:00:00.000Z',
    updatedAt: '2026-06-18T00:00:00.000Z',
  },
]

describe('settings model presets', () => {
  it('returns provider presets for common OpenAI-compatible vendors', () => {
    expect(getProviderPreset('DeepSeek')?.baseUrl).toBe('https://api.deepseek.com/v1')
    expect(getProviderPreset('Volcengine Ark')?.supportsVision).toBe(true)
  })

  it('builds a compact settings overview from runtime and model state', () => {
    expect(buildSettingsOverview(runtime, models)).toMatchObject({
      redisLabel: 'Redis 已连接',
      streamRecoveryLabel: '流式恢复已启用',
      defaultModelName: '默认生成模型',
      visionModelName: '视觉解析模型',
      enabledModelCount: 2,
      failedModelCount: 1,
      pendingQueueCount: 3,
    })
  })

  it('filters models by operational state', () => {
    expect(filterSettingsModels(models, 'vision').map((m) => m.id)).toEqual(['m-vision'])
    expect(filterSettingsModels(models, 'failed').map((m) => m.id)).toEqual(['m-vision'])
    expect(filterSettingsModels(models, 'default').map((m) => m.id)).toEqual(['m-default'])
  })

  it('detects model configuration issues for diagnostics', () => {
    expect(getModelIssueTags(models[1])).toEqual(['缺少 API Key', '最近测试失败'])
  })
})
