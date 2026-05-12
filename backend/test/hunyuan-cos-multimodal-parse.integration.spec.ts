/**
 * 集成测试（不发起真实混元 HTTP）：校验「COS + 开关 + 凭证」门闸与 MultimodalService.tryDirectCosMultimodal
 * 在混元 SDK 层被替换时的调用契约。真机联调仍需配置密钥并看解析结果前缀或后端日志。
 */
import { ConfigService } from '@nestjs/config'
import { Test } from '@nestjs/testing'
import { CosStorageService } from '@/modules/files/cos-storage.service'
import { MultimodalService } from '@/modules/multimodal/multimodal.service'
import { PrismaService } from '@/prisma/prisma.service'
import * as multimodalAnalysis from '@/utils/multimodalAnalysis'
import { canTryHunyuanCosMultimodalParse } from '@/utils/multimodalAnalysis'

function cfgFrom(map: Record<string, string | undefined>): ConfigService {
  return {
    get: (key: string, defaultValue?: string) => {
      if (Object.prototype.hasOwnProperty.call(map, key)) {
        const v = map[key]
        return v === undefined ? defaultValue : v
      }
      return defaultValue
    },
  } as unknown as ConfigService
}

function cosStub(configured = true): CosStorageService {
  return {
    isConfigured: () => configured,
    getSignedGetObjectUrl: jest.fn().mockResolvedValue('https://signed.example/object'),
  } as unknown as CosStorageService
}

function prismaMultimodalStub() {
  return {
    systemRuntimeConfig: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
    multimodalCacheEntry: {
      findUnique: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue({}),
      upsert: jest.fn().mockResolvedValue({ id: 'cache-1' }),
    },
    multimodalUsageRecord: {
      create: jest.fn().mockResolvedValue({ id: 'usage-1' }),
      aggregate: jest.fn().mockResolvedValue({ _sum: { estimatedCostCny: 0 } }),
    },
  }
}

const cosUri = 'cos://ap-guangzhou/demo-bucket/uploads/demo.png'
const hunyuanBody = `# 一、页面/文档功能概述\n${'x'.repeat(120)}\n`

describe('canTryHunyuanCosMultimodalParse', () => {
  it('开关未开时返回 false', () => {
    const cfg = cfgFrom({
      COS_SECRET_ID: 'id',
      COS_SECRET_KEY: 'key',
      COS_BUCKET: 'b',
      COS_REGION: 'ap-guangzhou',
    })
    expect(canTryHunyuanCosMultimodalParse(cfg, cosStub(), cosUri, 'image', 1024)).toBe(false)
  })

  it('path 非 cos:// 时返回 false', () => {
    const cfg = cfgFrom({
      HUNYUAN_COS_MULTIMODAL_PARSE_ENABLED: '1',
      COS_SECRET_ID: 'id',
      COS_SECRET_KEY: 'key',
      COS_BUCKET: 'b',
      COS_REGION: 'ap-guangzhou',
    })
    expect(canTryHunyuanCosMultimodalParse(cfg, cosStub(), '/tmp/local.png', 'image', 1024)).toBe(false)
  })

  it('COS 未配全时返回 false', () => {
    const cfg = cfgFrom({
      HUNYUAN_COS_MULTIMODAL_PARSE_ENABLED: '1',
      COS_SECRET_ID: 'id',
      COS_SECRET_KEY: 'key',
    })
    expect(canTryHunyuanCosMultimodalParse(cfg, cosStub(false), cosUri, 'image', 1024)).toBe(false)
  })

  it('凭证与 COS 齐全且为 cos URI 时返回 true（图片）', () => {
    const cfg = cfgFrom({
      HUNYUAN_COS_MULTIMODAL_PARSE_ENABLED: '1',
      COS_SECRET_ID: 'id',
      COS_SECRET_KEY: 'key',
      COS_BUCKET: 'b',
      COS_REGION: 'ap-guangzhou',
    })
    expect(canTryHunyuanCosMultimodalParse(cfg, cosStub(), cosUri, 'image', 1024)).toBe(true)
  })

  it('PDF 超过体积上限时返回 false', () => {
    const cfg = cfgFrom({
      HUNYUAN_COS_MULTIMODAL_PARSE_ENABLED: '1',
      COS_SECRET_ID: 'id',
      COS_SECRET_KEY: 'key',
      COS_BUCKET: 'b',
      COS_REGION: 'ap-guangzhou',
      HUNYUAN_COS_MULTIMODAL_MAX_PDF_MB: '1',
    })
    const twoMb = 2 * 1024 * 1024
    expect(
      canTryHunyuanCosMultimodalParse(cfg, cosStub(), 'cos://r/b/big.pdf', 'pdf', twoMb),
    ).toBe(false)
  })
})

describe('MultimodalService.tryDirectCosMultimodal (mock 混元)', () => {
  let analyzeSpy: jest.SpyInstance

  beforeEach(() => {
    analyzeSpy = jest.spyOn(multimodalAnalysis, 'analyzeCosFileWithHunyuanMultimodal').mockResolvedValue(hunyuanBody)
  })

  afterEach(() => {
    analyzeSpy.mockRestore()
  })

  async function createService(prisma: ReturnType<typeof prismaMultimodalStub>) {
    const cfg = cfgFrom({
      HUNYUAN_COS_MULTIMODAL_PARSE_ENABLED: '1',
      COS_SECRET_ID: 'id',
      COS_SECRET_KEY: 'key',
      COS_BUCKET: 'b',
      COS_REGION: 'ap-guangzhou',
    })
    const mod = await Test.createTestingModule({
      providers: [
        MultimodalService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: cfg },
        { provide: CosStorageService, useValue: cosStub() },
      ],
    }).compile()
    return mod.get(MultimodalService)
  }

  it('图片：canTry 为真时调用 analyzeCosFileWithHunyuanMultimodal 并返回正文', async () => {
    const prisma = prismaMultimodalStub()
    const svc = await createService(prisma)
    const out = await svc.tryDirectCosMultimodal({
      moduleType: 'FILE_PARSE',
      fileKind: 'IMAGE',
      userId: 'user-1',
      storedPath: cosUri,
      localPath: __filename,
      fileBytes: 2048,
    })
    expect(out).not.toBeNull()
    expect(out!.text).toContain('页面/文档功能概述')
    expect(out!.cacheHit).toBe(false)
    expect(analyzeSpy).toHaveBeenCalledTimes(1)
    expect(analyzeSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        storedPath: cosUri,
        fileKind: 'image',
      }),
    )
    expect(prisma.multimodalUsageRecord.create).toHaveBeenCalled()
  })

  it('PDF：同样走混元分析入口', async () => {
    const prisma = prismaMultimodalStub()
    const svc = await createService(prisma)
    const pdfUri = 'cos://ap-guangzhou/demo-bucket/uploads/demo.pdf'
    await svc.tryDirectCosMultimodal({
      moduleType: 'FILE_PARSE',
      fileKind: 'PDF',
      userId: 'user-1',
      storedPath: pdfUri,
      localPath: __filename,
      fileBytes: 4096,
    })
    expect(analyzeSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        storedPath: pdfUri,
        fileKind: 'pdf',
      }),
    )
  })

  it('开关关闭时不调用混元并返回 null', async () => {
    const prisma = prismaMultimodalStub()
    const cfg = cfgFrom({
      COS_SECRET_ID: 'id',
      COS_SECRET_KEY: 'key',
      COS_BUCKET: 'b',
      COS_REGION: 'ap-guangzhou',
    })
    const mod = await Test.createTestingModule({
      providers: [
        MultimodalService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: cfg },
        { provide: CosStorageService, useValue: cosStub() },
      ],
    }).compile()
    const svc = mod.get(MultimodalService)
    const out = await svc.tryDirectCosMultimodal({
      moduleType: 'FILE_PARSE',
      fileKind: 'IMAGE',
      userId: 'user-1',
      storedPath: cosUri,
      localPath: __filename,
      fileBytes: 2048,
    })
    expect(out).toBeNull()
    expect(analyzeSpy).not.toHaveBeenCalled()
  })

  it('非 IMAGE/PDF 直接返回 null', async () => {
    const prisma = prismaMultimodalStub()
    const svc = await createService(prisma)
    const out = await svc.tryDirectCosMultimodal({
      moduleType: 'FILE_PARSE',
      fileKind: 'WORD',
      userId: 'user-1',
      storedPath: cosUri,
      fileBytes: 100,
    })
    expect(out).toBeNull()
    expect(analyzeSpy).not.toHaveBeenCalled()
  })
})
