import { SettingsService } from '@/modules/settings/settings.service'

const baseModel = {
  id: 'model-1',
  name: 'GPT',
  provider: 'OpenAI',
  modelId: 'gpt-4o',
  baseUrl: 'https://api.openai.com/v1',
  apiKey: 'sk-test',
  maxTokens: 4096,
  temperature: 0.7,
  isDefault: false,
  isActive: true,
  supportsVision: false,
  useForDocumentVisionParse: false,
  lastTestAt: null,
  lastTestOk: null,
  lastTestLatencyMs: null,
  lastTestError: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
}

function createPrismaMock() {
  const prisma: any = {
    aIModelConfig: {
      count: jest.fn().mockResolvedValue(1),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      create: jest.fn().mockResolvedValue(baseModel),
      findUnique: jest.fn().mockResolvedValue(baseModel),
      findFirst: jest.fn().mockResolvedValue({ ...baseModel, id: 'model-2', name: 'Fallback' }),
      update: jest.fn().mockResolvedValue(baseModel),
      delete: jest.fn().mockResolvedValue(baseModel),
    },
    adminAuditLog: {
      create: jest.fn().mockResolvedValue({ id: 'audit-1' }),
    },
  }
  prisma.$transaction = jest.fn(async (fn: (tx: any) => Promise<unknown>) => fn(prisma))
  return prisma
}

describe('SettingsService admin audit logging', () => {
  it('records AI model creation without leaking apiKey', async () => {
    const prisma = createPrismaMock()
    const service = new SettingsService(prisma as any, {} as any)

    await service.createAiModel(
      {
        name: 'GPT',
        provider: 'OpenAI',
        modelId: 'gpt-4o',
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'sk-secret',
      },
      'admin-1',
      '127.0.0.1',
    )

    expect(prisma.adminAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        operatorId: 'admin-1',
        targetUserId: 'admin-1',
        action: 'SETTINGS_AI_MODEL_CREATE',
        ip: '127.0.0.1',
        detail: expect.objectContaining({
          targetType: 'AI_MODEL',
          targetId: 'model-1',
          targetName: 'GPT',
          modelId: 'gpt-4o',
          hasApiKey: true,
        }),
      }),
    })
    expect(JSON.stringify(prisma.adminAuditLog.create.mock.calls[0][0])).not.toContain('sk-secret')
  })

  it('records AI model update and marks apiKey changes without storing the key', async () => {
    const prisma = createPrismaMock()
    const service = new SettingsService(prisma as any, {} as any)

    await service.updateAiModel('model-1', { name: 'GPT updated', apiKey: 'sk-new' }, 'admin-1', '127.0.0.1')

    expect(prisma.adminAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'SETTINGS_AI_MODEL_UPDATE',
        detail: expect.objectContaining({
          targetType: 'AI_MODEL',
          targetId: 'model-1',
          targetName: 'GPT',
          changedFields: ['name', 'apiKey'],
          apiKeyChanged: true,
        }),
      }),
    })
    expect(JSON.stringify(prisma.adminAuditLog.create.mock.calls[0][0])).not.toContain('sk-new')
  })

  it('records multimodal runtime config updates', async () => {
    const prisma = createPrismaMock()
    const multimodal = {
      upsertRuntimeConfig: jest.fn().mockReturnValue({ multimodalEnabled: false, maxConcurrentTasks: 2 }),
    }
    const service = new SettingsService(prisma as any, multimodal as any)

    await service.updateMultimodalConfig({ multimodalEnabled: false, maxConcurrentTasks: 2 }, 'admin-1', '127.0.0.1')

    expect(prisma.adminAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'SETTINGS_MULTIMODAL_CONFIG_UPDATE',
        detail: expect.objectContaining({
          targetType: 'SETTINGS',
          targetName: '多模态配置',
          changedFields: ['multimodalEnabled', 'maxConcurrentTasks'],
        }),
      }),
    })
  })
})
