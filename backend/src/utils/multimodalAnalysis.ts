import { ConfigService } from '@nestjs/config'
import { Logger } from '@nestjs/common'
import { hunyuan } from 'tencentcloud-sdk-nodejs-hunyuan'
import { CosStorageService } from '@/modules/files/cos-storage.service'

const logger = new Logger('HunyuanCosMultimodal')

/** 与 OCR / COS SDK 一致的凭证解析 */
export function resolveTencentCredentialsForHunyuan(
  config: ConfigService,
): { secretId: string; secretKey: string } | null {
  const secretId =
    config.get<string>('TENCENTCLOUD_SECRET_ID')?.trim() ||
    config.get<string>('COS_SECRET_ID')?.trim()
  const secretKey =
    config.get<string>('TENCENTCLOUD_SECRET_KEY')?.trim() ||
    config.get<string>('COS_SECRET_KEY')?.trim()
  if (!secretId || !secretKey) return null
  return { secretId, secretKey }
}

/** 是否开启「COS URL → 混元多模态」文档解析（默认关闭，避免变更线上行为） */
export function isHunyuanCosMultimodalParseEnabled(config: ConfigService): boolean {
  return config.get<string>('HUNYUAN_COS_MULTIMODAL_PARSE_ENABLED') === '1'
}

/**
 * 是否满足尝试混元 COS 直读的前提（开关、COS URI、密钥、体积上限）。
 */
export function canTryHunyuanCosMultimodalParse(
  config: ConfigService,
  cosStorage: CosStorageService,
  storedPath: string,
  fileKind: 'image' | 'pdf',
  fileBytes: number,
): boolean {
  if (!isHunyuanCosMultimodalParseEnabled(config)) return false
  if (!CosStorageService.isCosUri(storedPath)) return false
  if (!cosStorage.isConfigured()) {
    logger.warn('Hunyuan COS multimodal: COS 未配置完整，跳过')
    return false
  }
  if (!resolveTencentCredentialsForHunyuan(config)) {
    logger.warn('Hunyuan COS multimodal: 未配置 TENCENTCLOUD_SECRET_* / COS_SECRET_*，跳过')
    return false
  }
  if (fileKind === 'pdf') {
    const maxMb = parseInt(config.get<string>('HUNYUAN_COS_MULTIMODAL_MAX_PDF_MB') || '40', 10)
    const mb = fileBytes / (1024 * 1024)
    if (Number.isFinite(maxMb) && maxMb > 0 && mb > maxMb) {
      logger.warn(`Hunyuan COS multimodal: PDF ${mb.toFixed(1)}MB 超过上限 ${maxMb}MB，跳过`)
      return false
    }
  }
  if (fileKind === 'image') {
    const maxMb = parseInt(config.get<string>('HUNYUAN_COS_MULTIMODAL_MAX_IMAGE_MB') || '18', 10)
    const mb = fileBytes / (1024 * 1024)
    if (Number.isFinite(maxMb) && maxMb > 0 && mb > maxMb) {
      logger.warn(`Hunyuan COS multimodal: 图片 ${mb.toFixed(1)}MB 超过上限 ${maxMb}MB，跳过`)
      return false
    }
  }
  return true
}

function buildStructuredRequirementPrompt(fileKind: 'image' | 'pdf'): string {
  const docLabel = fileKind === 'image' ? 'UI设计图' : 'PDF文档'
  return `你是资深产品需求分析师，请仔细分析这张${docLabel}，提取完整的结构化需求分析报告。

请严格按照以下格式输出，语言专业简洁，不要添加无关内容：

# 一、页面/文档功能概述
- 页面名称：
- 核心功能：
- 目标用户：
- 业务价值：

# 二、核心功能模块
| 模块名称 | 功能描述 | 优先级（高/中/低） |
|----------|----------|-------------------|
| 模块1    | ...      | 高                |

# 三、交互逻辑说明
- 按钮点击事件：
- 表单提交逻辑：
- 页面跳转规则：
- 状态变化逻辑：

# 四、UI元素与布局
- 主要组件：（列出所有按钮、输入框、列表、导航等组件）
- 布局结构：
- 视觉风格：

# 五、非功能需求
- 性能要求：
- 兼容性要求：
- 响应式要求：

# 六、接口需求
| 接口名称 | 请求方法 | 接口路径 | 功能说明 |
|----------|----------|----------|----------|
| 接口1    | POST     | /api/xxx | 功能说明 |

# 七、风险与建议
- 潜在风险：
- 优化建议：

请确保分析全面，覆盖所有可见的功能和交互细节。`
}

export type AnalyzeCosMultimodalParams = {
  config: ConfigService
  cosStorage: CosStorageService
  /** DB 中的 cos://region/bucket/key */
  storedPath: string
  fileKind: 'image' | 'pdf'
}

export type HunyuanCosPromptParams = AnalyzeCosMultimodalParams & {
  prompt: string
}

export async function runHunyuanCosPrompt(
  params: HunyuanCosPromptParams,
): Promise<{ text: string; promptTokens?: number; completionTokens?: number; totalTokens?: number }> {
  const cred = resolveTencentCredentialsForHunyuan(params.config)
  if (!cred) {
    throw new Error('混元多模态：缺少 TENCENTCLOUD_SECRET_* 或 COS_SECRET_*')
  }
  const ttlRaw =
    params.config.get<string>('HUNYUAN_COS_URL_EXPIRES_SEC')?.trim() ||
    params.config.get<string>('TENCENT_OCR_COS_URL_EXPIRES_SEC')?.trim() ||
    '7200'
  const ttl = parseInt(ttlRaw, 10)
  const expires = Number.isFinite(ttl) && ttl >= 60 && ttl <= 86400 ? ttl : 7200
  const signedUrl = await params.cosStorage.getSignedGetObjectUrl(params.storedPath, expires)

  const region =
    params.config.get<string>('HUNYUAN_REGION')?.trim() ||
    params.config.get<string>('COS_REGION')?.trim() ||
    'ap-guangzhou'
  const model =
    params.config.get<string>('HUNYUAN_MULTIMODAL_MODEL')?.trim() || 'hunyuan-vision'
  const temperature = parseFloat(params.config.get<string>('HUNYUAN_MULTIMODAL_TEMPERATURE') || '0.1')
  const reqTimeoutSec = parseInt(params.config.get<string>('HUNYUAN_MULTIMODAL_REQ_TIMEOUT_SEC') || '180', 10)
  const t = Number.isFinite(reqTimeoutSec) && reqTimeoutSec >= 30 ? reqTimeoutSec : 180

  const HunyuanClient = hunyuan.v20230901.Client
  const client = new HunyuanClient({
    credential: { secretId: cred.secretId, secretKey: cred.secretKey },
    region,
    profile: { httpProfile: { reqTimeout: t } },
  })

  const res = await client.ChatCompletions({
    Model: model,
    Messages: [
      {
        Role: 'user',
        Contents: [
          { Type: 'text', Text: params.prompt },
          { Type: 'image_url', ImageUrl: { Url: signedUrl } },
        ],
      },
    ],
    Temperature: Number.isFinite(temperature) ? temperature : 0.1,
    Stream: false,
    EnableEnhancement: false,
  })

  if (res.ErrorMsg?.Msg) {
    throw new Error(String(res.ErrorMsg.Msg))
  }
  const finish = res.Choices?.[0]?.FinishReason
  if (finish === 'sensitive') {
    throw new Error('混元多模态输出未通过安全审核')
  }
  const msg = res.Choices?.[0]?.Message
  const text = typeof msg?.Content === 'string' ? msg.Content.trim() : ''
  if (!text) {
    throw new Error('混元多模态返回内容为空')
  }
  return {
    text,
    promptTokens: res?.Usage?.PromptTokens,
    completionTokens: res?.Usage?.CompletionTokens,
    totalTokens: res?.Usage?.TotalTokens,
  }
}

/**
 * 使用腾讯云混元 **hunyuan-vision**，对 COS 签名 URL 指向的图片或 PDF 做一次多模态理解，
 * 返回结构化需求分析正文（Markdown）。失败时抛出异常，由调用方降级到 OCR/原视觉管线。
 */
export async function analyzeCosFileWithHunyuanMultimodal(
  params: AnalyzeCosMultimodalParams,
): Promise<string> {
  const prompt = buildStructuredRequirementPrompt(params.fileKind)
  const out = await runHunyuanCosPrompt({ ...params, prompt })
  return out.text
}
