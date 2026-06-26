import { BadRequestException } from '@nestjs/common'
import { AiService } from '@/modules/ai/ai.service'

function createAiService(prismaMock: any) {
  const configMock = { get: jest.fn() }
  const service = new AiService(prismaMock as any, configMock as any, {} as any, {} as any, {} as any)
  jest.spyOn(service as any, 'getOpenAIClient').mockResolvedValue({
    client: {} as any,
    modelId: 'test-model',
    modelName: 'test-model',
    configId: null,
  })
  return service
}

describe('AiService file ownership checks', () => {
  it('generate rejects foreign fileId', async () => {
    const prismaMock = {
      uploadedFile: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    }
    const service = createAiService(prismaMock)
    await expect(
      service.generate({ sourceType: 'file', fileId: 'foreign-file' } as any, 'user-b'),
    ).rejects.toBeInstanceOf(BadRequestException)
  })

  it('generateStream rejects foreign fileId', async () => {
    const prismaMock = {
      uploadedFile: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    }
    const service = createAiService(prismaMock)
    const res = {
      setHeader: jest.fn(),
      flushHeaders: jest.fn(),
      write: jest.fn(),
      end: jest.fn(),
      writableEnded: false,
    }
    await expect(
      service.generateStream({ sourceType: 'file', fileId: 'foreign-file' } as any, 'user-b', res as any),
    ).rejects.toBeInstanceOf(BadRequestException)
  })
})
