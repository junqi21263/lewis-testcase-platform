import { BadRequestException } from '@nestjs/common'
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

function createPrismaMock(existing = baseModel, next: typeof baseModel | null = null) {
  const prisma: any = {
    aIModelConfig: {
      findUnique: jest.fn().mockResolvedValue(existing),
      findFirst: jest.fn().mockResolvedValue(next),
      update: jest.fn().mockResolvedValue(next ?? existing),
      delete: jest.fn().mockResolvedValue(existing),
    },
  }
  prisma.$transaction = jest.fn(async (fn: (tx: any) => Promise<unknown>) => fn(prisma))
  return prisma
}

describe('SettingsService AI model deletion', () => {
  it('hard deletes an archived model instead of toggling active state', async () => {
    const prisma = createPrismaMock({ ...baseModel, isActive: false })
    const service = new SettingsService(prisma as any, {} as any)

    await expect(service.deleteAiModel('model-1')).resolves.toEqual({ ok: true })

    expect(prisma.aIModelConfig.delete).toHaveBeenCalledWith({ where: { id: 'model-1' } })
    expect(prisma.aIModelConfig.update).not.toHaveBeenCalled()
    expect(prisma.$transaction).toHaveBeenCalledTimes(1)
  })

  it('promotes another active model before deleting the current default model', async () => {
    const nextModel = { ...baseModel, id: 'model-2', name: 'Fallback', isDefault: false }
    const prisma = createPrismaMock({ ...baseModel, isDefault: true }, nextModel)
    const service = new SettingsService(prisma as any, {} as any)

    await service.deleteAiModel('model-1')

    expect(prisma.aIModelConfig.update).toHaveBeenCalledWith({
      where: { id: 'model-2' },
      data: { isDefault: true },
    })
    expect(prisma.aIModelConfig.delete).toHaveBeenCalledWith({ where: { id: 'model-1' } })
  })

  it('rejects deleting the last active default model', async () => {
    const prisma = createPrismaMock({ ...baseModel, isDefault: true }, null)
    const service = new SettingsService(prisma as any, {} as any)

    await expect(service.deleteAiModel('model-1')).rejects.toBeInstanceOf(BadRequestException)
    expect(prisma.aIModelConfig.delete).not.toHaveBeenCalled()
  })
})
