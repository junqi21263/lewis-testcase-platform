/**
 * 集成测试（不发起真实混元 HTTP）：校验「开关 + sk + 本地文件」门闸与 MultimodalService.tryDirectCosMultimodal
 * 在混元 axios 层被 mock 时的调用契约。真机联调需配置 HUNYUAN_VISION_API_KEY 并看解析日志。
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

describe('canTryHunyuanCosMultimodalParse（OpenAI 兼容通道，本地 Base64）', () => {
  it('开关未开时返回 false', () => {
    const cfg = cfgFrom({
      HUNYUAN_VISION_API_KEY: 'sk-test',
    })
    expect(canTryHunyuanCosMultimodalParse(cfg, cosStub(), cosUri, 'image', 1024, __filename)).toBe(false)
  })

  it('未配置 API Key 时返回 false', () => {
    const cfg = cfgFrom({
      HUNYUAN_MULTIMODAL_ENABLED: '1',
    })
    expect(canTryHunyuanCosMultimodalParse(cfg, cosStub(), cosUri, 'image', 1024, __filename)).toBe(false)
  })

  it('本地路径缺失或文件不存在时返回 false', () => {
    const cfg = cfgFrom({
      HUNYUAN_MULTIMODAL_ENABLED: '1',
      HUNYUAN_VISION_API_KEY: 'sk-test',
    })
    expect(canTryHunyuanCosMultimodalParse(cfg, cosStub(), cosUri, 'image', 1024)).toBe(false)
    expect(
      canTryHunyuanCosMultimodalParse(cfg, cosStub(), cosUri, 'image', 1024, '/no/such/file-xyz.png'),
    ).toBe(false)
  })

  it('开关 + sk + 可读本地文件时返回 true（与 storedPath 是否 cos:// 无关）', () => {
    const cfg = cfgFrom({
      HUNYUAN_MULTIMODAL_ENABLED: '1',
      HUNYUAN_VISION_API_KEY: 'sk-test',
    })
    expect(canTryHunyuanCosMultimodalParse(cfg, cosStub(), '/tmp/local.png', 'image', 1024, __filename)).toBe(
      true,
    )
    expect(canTryHunyuanCosMultimodalParse(cfg, cosStub(), cosUri, 'image', 1024, __filename)).toBe(true)
  })

  it('兼容旧开关 HUNYUAN_COS_MULTIMODAL_PARSE_ENABLED', () => {
    const cfg = cfgFrom({
      HUNYUAN_COS_MULTIMODAL_PARSE_ENABLED: '1',
      HUNYUAN_VISION_API_KEY: 'sk-test',
    })
    expect(canTryHunyuanCosMultimodalParse(cfg, cosStub(), cosUri, 'image', 1024, __filename)).toBe(true)
  })

  it('PDF 超过体积上限时返回 false', () => {
    const cfg = cfgFrom({
      HUNYUAN_MULTIMODAL_ENABLED: '1',
      HUNYUAN_VISION_API_KEY: 'sk-test',
      HUNYUAN_COS_MULTIMODAL_MAX_PDF_MB: '1',
    })
    const twoMb = 2 * 1024 * 1024
    expect(canTryHunyuanCosMultimodalParse(cfg, cosStub(), cosUri, 'pdf', twoMb, __filename)).toBe(false)
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
      HUNYUAN_MULTIMODAL_ENABLED: '1',
      HUNYUAN_VISION_API_KEY: 'sk-test',
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
        localPath: __filename,
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
        localPath: __filename,
        fileKind: 'pdf',
      }),
    )
  })

  it('开关关闭时不调用混元并返回 null', async () => {
    const prisma = prismaMultimodalStub()
    const cfg = cfgFrom({
      HUNYUAN_VISION_API_KEY: 'sk-test',
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

describe('CosStorageService URI normalization', () => {
  it('parseUri 可清洗 key 中的注释片段', () => {
    const svc = new CosStorageService(cfgFrom({}))
    const dirty =
      'cos://ap-guangzhou/lewistest-1420560890/ai-uploads/ # 上传文件的前缀目录，方便管理/b2941a25-850a-4eb6-a0f3-4acd49c0a351.png'
    const parsed = svc.parseUri(dirty)
    expect(parsed).toEqual({
      region: 'ap-guangzhou',
      bucket: 'lewistest-1420560890',
      key: 'ai-uploads/b2941a25-850a-4eb6-a0f3-4acd49c0a351.png',
    })
  })

  it('buildUri 会移除 token/prefix 的行内注释与空白', () => {
    const svc = new CosStorageService(cfgFrom({}))
    const out = svc.buildUri(
      ' ap-guangzhou # region comment',
      ' lewistest-1420560890 ',
      'ai-uploads/ # 上传文件的前缀目录，方便管理/abc.png',
    )
    expect(out).toBe('cos://ap-guangzhou/lewistest-1420560890/ai-uploads/abc.png')
  })
})
